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

## Dompet, kartu kredit, dan saldo tersedia

`Wallet.kind` membedakan aset (`debit`) dari liabilitas (`credit`); `medium` membedakan
rekening, e-wallet, tunai, dan kartu. Tabungan adalah dana yang disisihkan di dalam
dompet debit, bukan dompet baru.

| Ukuran | Aturan |
| --- | --- |
| Saldo aset | Jumlah saldo semua dompet debit. |
| Likuiditas sederhana | Saldo debit dikurangi nilai mutlak saldo kartu kredit (`totalLiquidity`). |
| Kewajiban kartu untuk arus kas bebas | Sisa tagihan pembuka periode setelah pembayaran kartu **ditambah** belanja kartu pada periode aktif (`creditObligationBreakdown`). |
| Sisa anggaran manual | `Σ max(allocated − spent, 0)` untuk anggaran periode aktif. |
| Dana disisihkan | Jumlah saldo tabungan aktif; tidak mengubah saldo rekening, tetapi mengurangi uang bebas. |
| Aman dibelanjakan | Saldo aset − kewajiban kartu − sisa anggaran manual − dana disisihkan. Hasil negatif tetap ditampilkan sebagai defisit. |

`previousPeriodBill` adalah baseline tagihan kartu yang dapat dikoreksi pengguna. Saat
periode baru dibuka, tagihan itu digulir dari kewajiban periode sebelumnya. Pembayaran
kartu menutup baseline lama; belanja kartu periode berjalan tetap menjadi kewajiban
periode berikutnya. Perubahan saldo manual dan pengarsipan dompet diproses melalui
perintah finansial agar jejaknya dapat ditelusuri.

### Sisa limit kredit lintas periode

Sisa limit memakai **seluruh cicilan yang belum lunas**, termasuk transaksi dari periode
tertutup. Rumus di `creditLimitBreakdown` merekonsiliasi saldo kartu yang tercatat di
ledger dengan transaksi cicilan dan alokasi pembayaran, lalu mengganti bagian cicilan
tercatat dengan seluruh sisa cicilan:

```text
saldo_lain = saldo_kartu − bagian_cicilan_yang_sudah_tercatat_di_saldo
limit_terpakai = max(0, saldo_lain + seluruh_sisa_cicilan)
sisa_limit = max(0, limit_kartu − limit_terpakai)
```

Cicilan yang sudah lunas tetap diperlukan dalam rekonsiliasi saldo ledger, tetapi tidak
menambah `seluruh_sisa_cicilan`. Bila rincian harga/bunga transaksi lama belum tersedia,
total cicilan lama masih merupakan **perkiraan** dari nominal bulanan × tenor.

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
  dikecualikan agar pembelian kartu tidak dihitung dua kali.
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
dialokasikan kemudian. Jatuh tempo ke-`n` berada pada hari transaksi yang sama di
bulan ke-`n` berikutnya; bila bulan tujuan lebih pendek, tanggalnya dijepit ke hari
terakhir bulan tersebut. Hanya angsuran belum lunas yang menjadi tagihan mendatang.

Layar **Cicilan** menampilkan aktif, semua, dan lunas; jadwal periode ini/berikutnya
ditampilkan pada **Anggaran cicilan otomatis**. Transaksi lama yang belum memiliki
`itemTotal`/`interestTotal` tidak diisi dengan angka rekaan. Koreksi rincian harga
setelah ada pembayaran hanya boleh lewat jalur metadata; total yang harus dibayar
tidak boleh berubah agar alokasi dan progres yang sudah diposting tetap sah.
Cicilan yang seluruh angsurannya sudah lunas tidak lagi menghasilkan tagihan anggaran
otomatis.

## Anggaran dan periode

Anggaran manual menempel ke satu `BudgetPeriod`. `spent` dibaca dari
`v_budget_progress`, yakni realisasi transaksi posted yang dihubungkan ke anggaran.
`velocity = spent / allocated` bila alokasi positif; `remaining = allocated − spent`;
`over` bila spent melebihi alokasi. Jatah harian/mingguan pada layar Anggaran membagi
sisa anggaran **manual** dengan sisa hari periode (pembagi minimal satu).

Layar Anggaran menggabungkan alokasi manual dengan **cicilan otomatis yang jatuh tempo
di periode yang sedang dilihat**. Bagian cicilan otomatis memperhitungkan angsuran
terjadwal dan yang sudah dibayar; daftar periode berikutnya ditampilkan terpisah.
Laporan “Realisasi anggaran” dan proyeksinya menggunakan **anggaran manual periode
aktif** (`Budget`), bukan seluruh pengeluaran dan bukan total cicilan otomatis pada
layar Anggaran. Formula `safeToSpend` juga mencadangkan sisa anggaran manual; komponen
cicilan kartu masuk melalui kewajiban kartu sesuai periode, sedangkan sisa limit kartu
memperhitungkan seluruh tenor lintas periode.

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

**Catatan implementasi:** `useReceivables().total` saat ini menjumlahkan nominal awal
`amount` dari piutang aktif, bukan `amount − paid`. Karena itu, ringkasan total piutang
dan simulasi yang menggunakan `expectedReceivables` dapat lebih tinggi daripada sisa
yang benar-benar belum dibayar. Jangan menafsirkan angka tersebut sebagai total sisa
piutang sampai implementasinya diselaraskan.

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
Tren saldo direkonstruksi dari saldo saat ini dan delta transaksi; penyesuaian saldo
tetap memengaruhi tren, sementara transfer antar-dompet berdelta bersih nol. Analisis
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
mengubah saldo. `usePlanningContext` memakai:

```text
available = saldo aset − tabungan disisihkan − kewajiban kartu periode aktif
financialCondition = available − sisa anggaran manual
monthlyIncome = pemasukan riil 31 hari terakhir;
                jika nol, rata-rata pemasukan riil 90 hari / 3
nextMonthBills = kewajiban kartu dari creditObligationBreakdown
monthlyCapacity = max(0, monthlyIncome − total alokasi anggaran − nextMonthBills)
```

Nama `nextMonthBills` dalam konteks rencana saat ini berarti **kewajiban kartu**, bukan
penjumlahan jadwal langganan/pengingat. Kalkulator target dana, tenggat, kemampuan
membeli, belanja dadakan, dan target sisa memakai konteks tersebut. Piutang opsional
pada simulasi kemampuan membeli mengikuti keterbatasan `expectedReceivables` di atas.

| Simulasi | Aturan inti |
| --- | --- |
| Target dana | `needed = max(0, target − sudahTerkumpul)`; bulan = `ceil(needed / setoranBulanan)`. Jika setoran tidak diisi, gunakan `monthlyCapacity`. |
| Tenggat waktu | Setoran minimum = `ceil(needed / jumlahBulan)`. |
| Sanggup beli | Bandingkan harga dengan `financialCondition` ditambah piutang bila pengguna memilihnya. |
| Belanja dadakan | Tampilkan sisa dan jatah harian satu anggaran sebelum/sesudah nominal tambahan. |
| Target sisa | Hitung kekurangan terhadap `available − sisaAnggaran`; pemotongan dibagi proporsional pada sisa tiap anggaran. |
