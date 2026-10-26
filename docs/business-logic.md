# Aturan Bisnis — FirstFruit Finance

Dokumen ini menjelaskan perilaku aplikasi **saat ini**, bukan rencana fitur. Sumber
implementasi ada di `src/core/domain/`, `src/application/hooks.ts`,
`src/infrastructure/supabase/repositories.ts`, dan fungsi SQL. Bila dokumen dan kode
berbeda, verifikasi jalur runtime dan tes terlebih dahulu, lalu perbaiki keduanya secara
bersama. [Skema domain](schema.md) menjelaskan bentuk data dan pemetaan tabelnya.

## Konvensi yang berlaku di semua fitur

- Nominal sumber adalah **integer Rupiah (IDR)**. Kolom SQL `*_minor` juga berisi Rupiah,
  bukan sen. USD hanya konversi pada tampilan.
- Periode menggunakan tanggal awal dan akhir **inklusif**. Perbandingan tanggal kalender
  memakai hari lokal agar transaksi tidak berpindah hari karena konversi UTC.
- Data finansial dipisahkan menurut `workspace_id`; kewenangan berasal dari membership
  workspace dan RLS. Tombol yang disembunyikan di UI bukan pengganti validasi server.
- Posting transaksi memakai RPC atomik. Transaksi yang telah diposting tidak diubah
  langsung pada ledger: koreksi umum dilakukan melalui reversal/pengganti. Pengecualian
  terbatas seperti koreksi metadata harga cicilan memakai RPC khusus tanpa mengubah
  jurnal pembayaran yang sudah ada.
- Saldo, alokasi, dan laporan tidak boleh menghitung transfer antar-dompet sebagai
  pemasukan baru atau mengurangi anggaran dua kali.

## Dompet, kartu kredit, dan posisi keuangan

`Wallet.kind` membedakan aset (`debit`) dari liabilitas (`credit`); `medium` membedakan
rekening, e-wallet, tunai, dan kartu. Tabungan adalah dana yang disisihkan di dalam
dompet debit, bukan dompet baru.

Semua angka posisi dihitung sekali di `useDashboard` (`src/application/hooks.ts`) dan
dibaca oleh Beranda, Dompet, Anggaran, Laporan, Periode, dan Rencana. Angka kartu kredit
berasal dari `creditCardPosition` (`src/core/domain/credit-card.ts`).

| Ukuran | Aturan |
| --- | --- |
| Saldo aset | Jumlah saldo semua dompet debit. |
| Tabungan | Jumlah saldo tabungan aktif; tetap di dompet, tetapi tidak bebas dipakai. |
| Tagihan kartu | Sisa tagihan lalu (`previousPeriodBill` − pembayaran periode ini) + belanja kartu di luar cicilan + **semua** angsuran yang jatuh tempo di periode ini (termasuk angsuran pertama cicilan baru). |
| Cicilan belum ditagih | Angsuran yang jatuh tempo **setelah** periode acuan. |
| Utang kartu | Tagihan kartu + cicilan belum ditagih. Sama dengan limit terpakai. |
| Sisa limit | `max(0, limit − utang kartu)`. |
| Likuiditas bersih | Saldo aset − utang kartu. Dipakai di Dompet, ketahanan dana, dan tren saldo Laporan. |
| Sisa anggaran | `Σ max(allocated − spent, 0)` untuk anggaran periode aktif. |
| Arus kas bebas | Saldo aset − tagihan kartu − tabungan − sisa anggaran. Hasil negatif tetap ditampilkan sebagai defisit. Angka ini sama di Beranda, Anggaran, Laporan, Periode, dan Rencana. |

Arus kas bebas sengaja memakai **tagihan** kartu, bukan utang kartu: angsuran bulan-bulan
berikutnya baru mengurangi arus kas bebas pada periode jatuh temponya.

Periode acuan kartu adalah periode berjalan; bila belum ada yang dibuka, dipakai periode
terakhir yang ditutup karena tagihannya belum dibawa ke mana pun (`creditCardPeriod`).

Alokasi pembayaran ke cicilan **tidak** memengaruhi tagihan, utang, atau sisa limit. Uang
pembayaran sudah mengurangi tagihan lalu; memakai alokasi lagi akan mengurangi utang dua
kali (misalnya bila pembayaran dialokasikan ke angsuran yang belum ditagih). Alokasi hanya
menggerakkan progres di layar Cicilan.

`previousPeriodBill` adalah baseline tagihan kartu yang dapat dikoreksi pengguna. Pembayaran
kartu hanya menutup baseline itu; belanja dan angsuran periode berjalan menjadi tagihan
periode berikutnya. Saat periode dibuka, baseline diisi otomatis dengan saldo kartu
ditambah angsuran yang jatuh tempo sejak awal periode yang ditutup sampai sehari sebelum
periode baru (`installmentChargesBetween`). Angsuran itu diposting sebagai penyesuaian
saldo kartu bercatatan `Angsuran cicilan <periode> masuk tagihan`; catatan yang sama di
periode baru mencegah penagihan ganda bila proses dijalankan ulang. Perubahan saldo
manual dan pengarsipan dompet diproses melalui perintah finansial agar jejaknya dapat
ditelusuri.

Periode yang ditutup sebelum pembawaan angsuran otomatis ada tidak punya catatan itu.
Angsurannya dideteksi `uncarriedInstallmentCharges` dan ditampilkan di layar Dompet
(kartu terkait) dengan tombol **Masukkan ke tagihan lalu** (`billInstallmentCharges`), yang
memposting penyesuaian bercatatan sama per periode. Pengguna yang sudah menyamakan tagihan
lalu dengan lembar tagihan bank cukup melewatinya.

Bila rincian harga/bunga transaksi cicilan lama belum tersedia, nominal angsurannya masih
**perkiraan** dari nominal bulanan × tenor.

## Transaksi dan kategori

Satu form mencatat `expense`, `income`, atau `transfer`; field berubah sesuai jenis.
Pengeluaran dapat terkait `budgetId`, pemanfaatan (`self`, `shared`, `other`), dan
piutang. Transfer dapat mengisi tabungan pada dompet tujuan. Transfer ke kartu kredit
menjadi pembayaran kartu dan **tidak** boleh merealisasikan anggaran lagi.

- Kategori transaksi disimpan sebagai satu kategori terpilih pada database; repository
  membentuk jalur induk → anak untuk UI. Filter Transaksi dapat menyaring bertahap,
  termasuk seluruh tingkat di bawah **Giving**. Giving dihitung sebagai manfaat untuk
  orang lain pada analisis pemanfaatan.
- `budgetId` adalah hubungan eksplisit ke anggaran. Realisasi berasal dari transaksi
  posted yang teralokasi, bukan angka bebas yang dinaikkan oleh UI. Pembayaran kartu
  dikecualikan agar pembelian kartu tidak dihitung dua kali. Transaksi cicilan tidak
  dapat ditautkan ke anggaran karena angsurannya menjadi tagihan kartu tiap bulan.
- Penyesuaian saldo kartu kredit ditampilkan dengan tanda dibalik (`netWorthDirection`):
  saldo kartu naik berarti utang naik.
- Pembayaran kartu boleh dialokasikan ke satu atau beberapa cicilan. Nominal yang tidak
  dialokasikan tetap mengurangi tagihan kartu, tetapi tidak menaikkan progres cicilan.
  Mengubah alokasinya memakai RPC tersendiri tanpa menulis ulang jurnal pembayaran.
- Pemasukan pelunasan piutang menambah saldo dompet, tetapi bukan **pemasukan riil**.
  Transfer dan penyesuaian saldo juga bukan pemasukan/pengeluaran riil.
- **Pengeluaran riil** = `max(0, nominal pengeluaran − porsi piutang)`; transfer dan
  penyesuaian saldo bernilai nol untuk ukuran ini.

## Cicilan kartu kredit

Cicilan hanya tersedia untuk pengeluaran kartu kredit, dengan tenor **2–120 bulan**.
Form menyediakan dua cara input (`installmentQuote`):

| Cara input | Perhitungan |
| --- | --- |
| Cicilan per bulan | `totalBayar = cicilanBulanan × tenor`; `hargaBarang = totalBayar − totalBunga`. Harga barang harus positif. |
| Harga barang | `totalBayar = hargaBarang + totalBunga`; nominal bulanan diturunkan dari total dan tenor. |

Bunga adalah **nominal total selama tenor**, bukan persen atau bunga per bulan. Jika
totalBayar tidak habis dibagi tenor, sisa pembulatan Rp1 dibagikan ke angsuran paling
awal; jumlah semua angsuran tetap tepat sama dengan totalBayar. Contoh: harga barang
Rp1.000.000 + bunga Rp100.000 untuk 3 bulan menghasilkan Rp366.667, Rp366.667, dan
Rp366.666. Sebaliknya, input Rp500.000/bulan selama 3 bulan berarti **Rp500.000 tiap
bulan**, sehingga totalBayar Rp1.500.000, bukan Rp500.000 untuk seluruh tenor.

`installmentInitialPaidMonths` adalah angsuran yang sudah lunas sebelum transaksi
dicatat. `installmentPaidMonths` mencakup baseline itu dan pembayaran kartu yang
dialokasikan kemudian. Transaksi hanya bisa dicatat di periode berjalan, dan nominalnya
adalah angsuran pertama yang belum lunas. Karena itu angsuran `initialPaid + 1` **jatuh
pada tanggal transaksi**, angsuran berikutnya tiap bulan pada hari yang sama; bila bulan
tujuan lebih pendek, tanggalnya dijepit ke hari terakhir bulan tersebut. Semua tanggal
dibandingkan sebagai hari lokal.

Angsuran pertama itu diposting ke ledger kartu sebagai transaksi. Angsuran berikutnya tidak
punya transaksi sendiri: ia masuk tagihan kartu pada periode jatuh temponya dan dibawa ke
baseline saat periode berganti. Di rincian tagihan, semua angsuran periode ini (termasuk
yang pertama) tampil sebagai "cicilan", terpisah dari belanja kartu biasa.

Layar **Cicilan** menampilkan aktif, semua, dan lunas. Layar Anggaran, Kalender, dan
agenda Beranda menampilkan jadwal jatuh temponya. Transaksi lama yang belum memiliki
`itemTotal`/`interestTotal` tidak diisi dengan angka rekaan. Koreksi rincian harga
setelah ada pembayaran hanya boleh lewat jalur metadata; total yang harus dibayar
tidak boleh berubah agar alokasi dan progres yang sudah diposting tetap sah.
Cicilan yang seluruh angsurannya sudah lunas tidak lagi menambah tagihan maupun utang
kartu.

## Anggaran dan periode

Anggaran manual menempel ke satu `BudgetPeriod`. `spent` dibaca dari
`v_budget_progress`, yakni realisasi transaksi posted yang dihubungkan ke anggaran.
`velocity = spent / allocated` bila alokasi positif; `remaining = allocated − spent`;
`over` bila spent melebihi alokasi. Jatah harian/mingguan pada layar Anggaran membagi
sisa anggaran **manual** dengan sisa hari periode (pembagi minimal satu).

Total, realisasi, dan jatah harian di layar Anggaran hanya memakai anggaran yang dibuat
pengguna. Cicilan yang jatuh tempo di periode ini dan periode berikutnya ditampilkan
sebagai informasi: angsurannya sudah termasuk tagihan kartu, jadi tidak memotong
anggaran. Laporan “Realisasi anggaran” dan proyeksinya juga memakai anggaran periode
aktif (`Budget`), bukan seluruh pengeluaran.

Hanya satu periode berstatus `open` menjadi periode aktif. `draft` belum menghasilkan
laporan periode aktif; `closed` menjadi arsip. Periode dapat ditutup tanpa membuka
periode baru, membuka draft yang sudah ada, atau membuat periode berikutnya. Struktur
anggaran terpilih dapat disalin, tetapi realisasinya dimulai dari nol. Hari pertama
dan terakhir periode sama-sama dihitung (`periodProgress`).

### Proyeksi akhir periode

`forecastBudgetRealization` memperkirakan **total realisasi anggaran manual** per
kategori. Di UI ia tampil saat filter Laporan **Periode aktif** dipilih dan periode
tersebut belum selesai. Untuk kategori yang
punya riwayat, dipakai hingga **tiga periode tertutup sebelumnya** dengan nama anggaran
yang sama. Algoritme mengambil nilai tengah total historis dan porsi yang biasanya
muncul setelah posisi hari yang sebanding. Riwayat transaksi yang tidak cukup lengkap
memakai pembagian waktu netral; durasi periode yang sangat berbeda dinormalkan.

Biaya yang sudah dibayar di awal tidak dikalikan terus sampai akhir periode. Tagihan
yang biasanya dibayar di awal tetapi belum muncul pada periode ini tetap diantisipasi.
Pola aktual saat ini dapat menyesuaikan estimasi sisa secara terbatas. Tanpa riwayat
kategori, alokasi anggaran menjadi acuan awal; laju transaksi baru ikut diperhitungkan
setelah minimal **7 hari berjalan dan 3 hari belanja berbeda**. Satu transaksi besar
tidak otomatis dianggap biaya harian. Proyeksi tidak bisa lebih rendah daripada
realisasi yang sudah terjadi. Ini estimasi, bukan transaksi atau komitmen baru.

## Tabungan, piutang, dan split bill

- **Tabungan:** dana tetap berada di dompet debit. “Sisihkan” dibatasi uang yang
  tersedia setelah tabungan lain; “Ambil” dibatasi saldo tabungan tersebut. Tabungan
  arsip tidak dihitung sebagai dana terkunci.
- **Piutang:** nominal awal, jumlah terbayar, status (`open`, `partial`, `settled`,
  `written_off`), tanggal lunas, dan transaksi pelunas tersimpan terpisah. Pembentukan
  piutang dari pengeluaran tidak dianggap konsumsi riil untuk porsi yang ditagih balik.
- **Split bill:** nota berisi item dan pajak/servis; bagian tiap orang mencakup porsi
  harga item dan pajaknya. Penyelesaian dihitung di server; transfer yang menuju pemilik
  dapat membentuk piutang. Finalisasi dirancang idempoten.

Pada split bill, pajak/servis diisi **sekali per nota**, tetapi dihitung proporsional
pada setiap item: `totalItem = round(hargaItem × (1 + persenPajak/100))` dan porsi
peserta = `totalItem / jumlah peserta item`. Untuk setiap orang,
`net = total nota yang ditalangi − total porsi konsumsi`. Perhitungan transfer
penyelesaian menggunakan saldo `net` tersebut; pembulatan transfer akhir dilakukan
ke Rupiah.

`useReceivables().total` adalah sisa piutang aktif, `Σ max(amount − paid, 0)`. Angka ini
juga dipakai simulasi Rencana saat piutang ikut diperhitungkan.

## Langganan, kalender, dan notifikasi

Langganan adalah **jadwal tagihan/pengingat**, bukan transaksi finansial. Form hanya
meminta nama, nominal per tagihan, siklus, tanggal tagihan berikutnya, opsi **tanpa
tanggal berakhir**, dan hari pengingat. Menambah atau mengubahnya tidak mengurangi
saldo dompet dan tidak memposting transaksi; pembayaran dicatat tersendiri di Transaksi.
`endDate = null` berarti jadwal tanpa batas akhir yang diketahui. Siklus domain mendukung
mingguan, bulanan, kuartalan, tahunan, dan `custom` untuk data lama/API; form saat ini
menawarkan empat siklus pertama.

`monthlyCost` hanya menormalkan nominal tagihan menjadi perkiraan beban bulanan.
Siklus mingguan dikalikan `52/12`, kuartalan dibagi 3, tahunan dibagi 12, dan
`custom` dinormalkan menurut `30/customIntervalDays`. Ini bukan transaksi otomatis.
Kalender menampilkan tanggal tagihan dalam rentang berdasarkan `nextBillingDate`,
`startDate`, dan `endDate`, bersama transaksi dan pengingat. Grid bulan selalu 6 × 7
hari, dimulai pada Senin. Notifikasi langganan aktif
muncul bila jatuh tempo berada dalam `reminderDaysBefore`; pemberitahuan berakhir
memerlukan `endDate`. Notifikasi dan status baca disimpan per user/workspace; membuka
panel lonceng tidak otomatis menandai semuanya dibaca. Job database harian menyiapkan
notifikasi tagihan, masa akhir langganan, pengingat, dan anggaran yang melampaui pagu;
client membaca hasilnya dan memperbarui status baca secara terpisah.

## Laporan dan Pola

Ringkasan Laporan menyediakan rentang harian, periode aktif, tiga bulan, dan enam
bulan. Perbandingan dengan rentang sebelumnya memakai **jumlah hari yang sama**.
Tren saldo direkonstruksi mundur dari likuiditas bersih saat ini memakai delta transaksi.
Pembelian cicilan langsung mengurangi likuiditas bersih sebesar seluruh angsuran yang
tersisa, sesuai utang kartu. Penyesuaian saldo dompet debit memengaruhi tren; penyesuaian
kartu kredit (koreksi baseline, rekonsiliasi, angsuran yang ditagihkan) dilewati karena
bukan uang yang bergerak. Transfer antar-dompet berdelta nol. Laporan Periode memakai ukuran riil yang
sama: arus kas riil = pemasukan riil − pengeluaran riil. Analisis
arus kas riil mengecualikan transfer, penyesuaian, pelunasan piutang dari pemasukan,
dan porsi pengeluaran yang menjadi piutang.

Submenu **Pola** (`periodPatterns`) memakai paling banyak **delapan periode `closed`**,
urut dari lama ke baru. Untuk tiap periode: pemasukan riil, pengeluaran riil, arus kas
bersih, alokasi/realisasi anggaran manual, serta kelompok pengeluaran. Angka tren
dibagi dengan **semua hari kalender dalam periode**, bukan hanya hari transaksi.
Tampilan membandingkan periode terbaru dengan periode sebelumnya, menampilkan rata-rata
hingga tiga periode terakhir dan empat kelompok pengeluaran terbesar. Periode `open`
dan `draft` tidak dimasukkan agar bulan parsial tidak disandingkan dengan bulan selesai.

## Rencana keuangan

Rencana adalah simulasi murni; menghitung hasilnya tidak menulis transaksi atau
mengubah saldo. `usePlanningContext` membaca posisi dari `useDashboard`:

```text
available = saldo aset − tabungan − tagihan kartu
freeCash = available − sisa anggaran            (= arus kas bebas di Beranda)
monthlyIncome = pemasukan riil 31 hari terakhir;
                jika nol, rata-rata pemasukan riil 90 hari / 3
installmentMonthly = Σ angsuran yang jatuh tempo dalam sebulan sejak hari ini (dari jadwal)
monthlyCapacity = max(0, monthlyIncome − total alokasi anggaran − installmentMonthly)
```

Tagihan kartu tidak dikurangkan dari kapasitas bulanan karena belanja kartu sudah
tercakup di alokasi anggaran; yang ditambahkan hanya angsuran cicilan.

| Simulasi | Aturan inti |
| --- | --- |
| Target dana | `needed = max(0, target − sudahTerkumpul)`; bulan = `ceil(needed / setoranBulanan)`. Jika setoran tidak diisi, gunakan `monthlyCapacity`. |
| Tenggat waktu | Setoran minimum = `ceil(needed / jumlahBulan)`. |
| Sanggup beli | Bandingkan harga dengan `freeCash` ditambah sisa piutang bila pengguna memilihnya. |
| Belanja dadakan | Tampilkan sisa dan jatah harian satu anggaran sebelum/sesudah nominal tambahan. |
| Target sisa | Hitung kekurangan terhadap `available − sisa anggaran` (= `freeCash`); pemotongan dibagi proporsional pada sisa tiap anggaran. |
