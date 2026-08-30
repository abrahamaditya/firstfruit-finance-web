# Aturan Bisnis — Abraham Finance

Dokumen ini adalah **sumber kebenaran perilaku aplikasi**. Setiap aturan di bawah punya
implementasi di `src/core/domain/*` (murni, tanpa React) atau di lapisan aksi `AppShell.tsx`.
Kalau ada perbedaan antara dokumen dan kode, dokumen ini yang harus dikoreksi lebih dulu
sebelum kode diubah.

Konvensi umum:

- **Semua nominal disimpan dalam Rupiah (IDR), integer.** USD hanya lapisan tampilan
  (`money.ts`, kurs live harian, cache `abraham.fx`).
- **Tanggal disimpan sebagai ISO string.** Perbandingan tanggal di kalender memakai kunci
  lokal `YYYY-MM-DD` (`calendar.ts → dayKey`) supaya tidak bergeser sehari karena UTC.
- Bila sebuah aturan berjalan "hanya saat CREATE", itu disengaja: perubahan turunan
  (saldo, realisasi anggaran, piutang) tidak dihitung ulang saat edit agar tidak dobel.

---

## 1. Dompet (Wallet)

| Aturan | Detail |
| --- | --- |
| Klasifikasi akuntansi | `kind` hanya `debit` (aset) atau `credit` (liabilitas). |
| Bentuk fisik | `medium` = `bank` \| `credit` \| `ewallet` \| `cash`. E-wallet & tunai tetap `kind: debit`. |
| Field kondisional | `bank` disembunyikan untuk tunai; `last4` hanya bank/kartu kredit; `phone` hanya e-wallet; `creditLimit` hanya kartu kredit. |
| Record lama | Dompet tanpa `medium` dibaca sebagai `credit` bila `kind === 'credit'`, selain itu `bank`. |
| Likuiditas | `totalLiquidity = Σ(debit.balance) − Σ(abs(credit.balance))` (`calculations.ts`). |
| Rollover tagihan kartu | Saat periode baru menjadi `open`, `previousPeriodBill` otomatis diisi dari kewajiban akhir periode yang ditutup: `tagihan pembuka lama − pembayaran kartu + pengeluaran kartu`. Bila tagihan lama lunas, nilainya sama dengan pengeluaran kartu periode sebelumnya. Pengguna tetap boleh menyesuaikannya lewat Edit Kartu. |

### Dompet default

Preferensi `defaultWalletId` (Profil → Uang). Dipakai untuk:

1. isian awal `walletId` pada form transaksi;
2. tujuan pemindahan saldo saat sebuah dompet dihapus.

Kalau dompet default sendiri yang dihapus, preferensinya dipindahkan ke dompet debit lain
yang tersisa (atau dikosongkan bila tidak ada).

### Jejak penyesuaian (audit trail)

Uang tidak boleh muncul atau hilang tanpa jejak. Dua aksi berikut **selalu** membuat transaksi
dengan `adjustment: true` dan `adjustmentReason` (label `Penyesuaian Saldo`, `nature: unexpected`):

| Aksi | Yang terjadi |
| --- | --- |
| Edit saldo dompet **debit** | Selisih `saldoBaru − saldoLama` dicatat: naik → `income`, turun → `expense`. |
| Edit saldo **kartu kredit** | Tagihan naik → `expense`, tagihan turun (dibayar) → `income`. |
| Hapus dompet debit bersaldo | Saldo dipindahkan ke dompet default → dicatat sebagai `transfer` dari dompet terhapus ke dompet default. |
| Hapus kartu kredit bertagihan | Sisa tagihan dibayar dari dompet default (saldo default berkurang) → dicatat sebagai `expense`. |
| Hapus dompet, tidak ada dompet tujuan | Saldo ikut terhapus; toast memberi tahu secara eksplisit. |
| Hapus dompet yang menampung tabungan | Semua `Saving` di dompet itu dipindahkan `walletId`-nya ke dompet default agar earmark tidak menggantung. |

Transaksi penyesuaian ditandai chip "⚖️ penyesuaian" di daftar transaksi sehingga bisa
dikecualikan saat menganalisa perilaku belanja.

---

## 2. Transaksi

Satu form menangani tiga jenis (`txType`): `expense`, `income`, `transfer`. Field lain
menyesuaikan pilihan ini; berganti jenis mengosongkan field khusus jenis sebelumnya.

### Field per jenis

| Field | expense | income | transfer |
| --- | :-: | :-: | :-: |
| `walletId` | dibayar dari | masuk ke | dari dompet |
| `toWalletId` | — | — | ✔ ke dompet |
| Kategori 3 tingkat | ✔ (pohon pengeluaran) | ✔ (pohon pemasukan) | — |
| `merchant` (tempat) | ✔ | ✔ | — |
| `budgetId` | ✔ | — | ✔ |
| `settlesReceivableId` | — | ✔ | — |
| `savingId` (sisihkan) | — | — | ✔ |
| `nature` | terencana / tak terduga | rutin / tidak rutin | selalu `fixed` |

### Efek samping saat CREATE

| Kondisi | Efek |
| --- | --- |
| Expense dengan pilar `Piutang` | Piutang dibuat sebesar **seluruh** nominal untuk nama pengutang yang diisi. |
| `budgetId` terisi pada expense/transfer biasa | `budget.spent += amount`. Transfer tetap netral terhadap total likuiditas. |
| Transfer pembayaran kartu kredit | Tidak menerima `budgetId`; hanya melunasi sisa tagihan periode sebelumnya dan mengurangi saldo rekening tanpa realisasi anggaran baru. Belanja kartu periode berjalan tetap menjadi tagihan periode berikutnya. |
| Edit pembayaran kartu kredit | Hanya alokasi cicilan yang dapat diubah. Nominal, rekening asal, kartu tujuan, tanggal, dan jurnal pembayaran tetap terkunci; perubahan alokasi tidak mengubah saldo. |
| Expense kartu + tenor cicilan | Tenor 2–120 bulan disimpan sebagai metadata; nominal transaksi dan realisasi anggaran tetap memakai jumlah yang dicatat. |
| `settlesReceivableId` terisi | `receivable.paid += amount`; lunas bila `paid ≥ amount`. |
| Pemasukan tanpa pilihan piutang | Dicocokkan otomatis bila **nama pihak sama persis** dan **sisa piutang == nominal**. |
| Transfer + `savingId` | `saving.balance += amount` (tabungan harus berada di dompet tujuan). |

### Kategori

Taksonomi 3 tingkat di `categories.ts`:

- **Tingkat 1** kelompok besar (11 pengeluaran, 5 pemasukan) — untuk gambaran besar.
- **Tingkat 2** kategori (33 / 12) — setara pos anggaran.
- **Tingkat 3** spesifik (114 / 38) — yang dicatat sehari-hari.

Aturannya:

1. Yang disimpan di `labels[0]` adalah **satu label paling dalam yang dipilih**.
2. Induknya dicari lewat indeks `categoryPath(label)` → `[besar, menengah, spesifik?]`.
3. Label di luar taksonomi (kategori bebas / data lama) tetap valid dan berdiri sendiri
   sebagai jalur satu elemen, dan muncul di grup "Kategori kamu".
4. Nama label harus unik lintas tingkat dalam satu pohon — indeks memakai nama sebagai kunci.
5. Bila tidak ada yang dipilih, kategori jatuh ke `Lainnya`.

---

## 3. Anggaran

- `velocity = spent / allocated`; `over = spent > allocated`; `remaining = allocated − spent`.
- **Jatah harian** = `sisa anggaran ÷ sisa hari periode` (minimal 1 hari). Mingguan = harian × 7.
- **Laju ideal** = `allocated × (hari berjalan ÷ total hari)`. Realisasi di bawah laju ideal =
  aman; di atasnya = kecepatan; melewati alokasi = jebol (tidak ada jatah harian tersisa).
- Realisasi (`spent`) bertambah otomatis hanya lewat transaksi yang memilih `budgetId`.

---

## 4. Tabungan (sinking fund)

- Tabungan adalah **earmark**, bukan dompet: uangnya tetap berada di `walletId`, saldo dompet
  tidak berubah.
- Saldo tersedia sebuah dompet = `wallet.balance − Σ(tabungan aktif di dompet itu)`.
- `safeToSpend = saldo aset − sisa tagihan kartu periode sebelumnya − kewajiban kartu
  periode ini − Σ(max(alokasi − realisasi, 0)) − Σ(tabungan)`.
  Liabilitas kartu dibentuk dari `tagihan pembuka − pembayaran + pengeluaran kartu periode
  ini`; field tagihan pembuka yang dikonfirmasi pengguna adalah sumber kebenarannya.
  Pembayaran lebih dulu mengurangi tagihan periode sebelumnya; kelebihannya mengurangi
  kewajiban periode ini. Pengeluaran tunai/debit tidak dikurangkan lagi karena sudah
  menurunkan saldo aset. Pengeluaran beranggaran yang sudah terjadi tidak dikurangkan ulang:
  yang dicadangkan hanya sisa anggarannya. Hasil tidak dijepit ke nol; nilai negatif
  ditampilkan sebagai defisit arus kas bebas.
- Aksi **Sisihkan** dibatasi saldo tersedia; aksi **Ambil** dibatasi saldo tabungan itu sendiri.

---

## 5. Piutang (Receivable)

- Sumbernya: dibuat manual, otomatis dari transaksi `lent`/`shared`, atau dari hasil split bill.
- `paid` mengakumulasi pembayaran; `settled = paid ≥ amount`. Total piutang aktif memakai
  **sisa** (`amount − paid`), bukan nominal awal.
- Saat lunas lewat transaksi, `settledAt` dan `settledByTxId` diisi sehingga bisa ditelusuri
  balik ke transaksi pemasukannya.

---

## 6. Split bill (`split.ts`)

- Struktur: **nota** → **item**. Tiap nota punya satu `payerId` (yang menalangi) dan satu
  `taxPercent` (pajak/servis untuk seluruh nota).
- **Pajak diisi sekali per nota, lalu disebar ke tiap item sesuai harganya**:
  `itemTotal = price × (1 + taxPercent/100)`. Konsekuensinya porsi tiap orang membawa
  pajaknya sendiri — orang yang memesan lebih mahal menanggung pajak lebih besar —
  bukan pajak yang dibagi rata per kepala.
- Porsi seseorang atas sebuah item = `itemTotal ÷ jumlah orang yang berbagi item itu`.
- `net = total yang dia talangi − total yang dia konsumsi`. Jumlah seluruh `net` selalu 0.
- **Settle-up greedy**: utang terbesar dilunasi ke piutang terbesar sampai habis, sehingga
  jumlah transfer seminimal mungkin. Hanya transfer yang menuju "saya" yang dituliskan
  sebagai piutang.

---

## 7. Langganan (`subscription.ts`, `calendar.ts`)

- `monthlyCost` menormalkan siklus ke bulanan (mingguan ×52/12, kuartalan ÷3, tahunan ÷12).
- Pengingat aktif bila `0 ≤ hari menuju tagihan ≤ reminderDaysBefore` dan status `active`.
- "Akan berakhir" bila `endDate` ada dan tinggal ≤14 hari.
- Kategori langganan memakai pilar dan sub-kategori pengeluaran yang sama dengan form
  transaksi (`PILLAR_EXPENSE_TREE`); nilai terdalam yang dipilih disimpan. Kategori lama
  tetap ditampilkan saat edit sampai pengguna memilih nilai dari taksonomi baru.
- `billingDatesInRange` menghitung tanggal tagihan di rentang tampilan kalender: ditarik mundur
  dari `nextBillingDate` (tidak melewati `startDate`) lalu maju sampai batas rentang atau `endDate`.

---

## 8. Kalender & pengingat

- Grid bulan = 6×7 hari penuh, minggu dimulai **Senin**.
- Isi sebuah tanggal: transaksi (opsional lewat toggle), jatuh tempo langganan, dan pengingat.
- Pengingat (`Reminder`) punya nominal opsional; yang bernominal ikut dihitung sebagai
  "tagihan bulan depan" pada simulasi rencana keuangan.

---

## 9. Laporan & insight

- Rentang **Periode aktif** memakai `start`–`end` periode berstatus `open`, termasuk
  periode yang dimulai tanggal 28; `draft` tidak dianggap periode aktif.
- Metrik pemasukan, pengeluaran, kategori, dan laporan harian mengecualikan transaksi
  penyesuaian. Transfer juga tidak menjadi pemasukan/pengeluaran karena netral terhadap kas.
- Tren saldo direkonstruksi dari likuiditas aktual (`debit − liabilitas kartu`) dan delta
  transaksi. Penyesuaian ikut mengubah tren; transfer, termasuk pembayaran kartu, berdelta 0.
  Belanja kartu tetap menurunkan likuiditas pada tanggal transaksi sebesar nominal penuh.
- Rata-rata harian membagi total belanja dengan seluruh hari kalender dalam rentang, bukan
  hanya hari yang memiliki transaksi. Persentase kategori memakai seluruh pengeluaran
  sebagai penyebut, termasuk kategori di luar delapan teratas.
- Insight transaksi mengikuti rentang terpilih dan merangkum pengeluaran terbesar,
  rata-rata per transaksi, hari belanja tertinggi, porsi kartu kredit, serta jumlah dan
  nominal transaksi cicilan.
- Total anggaran selalu merujuk ke periode aktif dan menampilkan alokasi, persentase
  realisasi, serta sisa yang boleh bernilai negatif. Analisis kategori membandingkan
  setiap kategori dengan rentang sebelumnya yang berdurasi sama, selain menampilkan
  porsi pengeluaran, jumlah transaksi, dan rata-rata nominalnya. Laporan memakai tingkat
  kategori menengah; label spesifik otomatis digabungkan ke kategori induknya.

---

## 10. Rencana keuangan (`planning.ts`)

Konteks angka (`usePlanningContext`):

- `available` = likuiditas − tabungan terkunci.
- `monthlyIncome` = pemasukan 31 hari terakhir; bila nol, rata-rata 90 hari ÷ 3.
- `nextMonthBills` = tagihan langganan bulan depan + pengingat bernominal bulan depan.
- `monthlyCapacity` = `max(0, monthlyIncome − allocatedTotal − nextMonthBills)`.

| Metode | Rumus inti |
| --- | --- |
| Target dana | `needed = target − sudahPunya`; `months = ceil(needed ÷ setoran)`; setoran kosong → pakai `monthlyCapacity`. `strain = setoran ÷ kapasitas` (>1 = memaksa). |
| Deadline → setoran | `requiredPerMonth = ceil(needed ÷ bulan)`; realistis bila ≤ kapasitas. |
| Sanggup beli | `surplus = (pemasukan + piutang opsional) − (anggaran + tagihan bulan depan)`; `leftover = surplus − harga`. Bila minus, dicek apakah bisa ditutup dari kas sekarang. |
| Belanja dadakan | Sisa & jatah harian sebuah anggaran sebelum vs sesudah tambahan belanja. |
| Target sisa | `projected = available − Σ sisa anggaran`; `needed = max(0, target − projected)`; pemotongan proporsional `ratio = needed ÷ Σ sisa`, per kategori `cut = sisa × ratio`. Tidak mungkin bila `needed > Σ sisa`. |

Semua metode **murni simulasi** — tidak menulis data apa pun.

---

## 11. Periode & tutup buku

- Hanya satu periode berstatus `open` yang dianggap aktif; `draft` belum berjalan.
- Periode `draft` dapat dibuka secara eksplisit bila tidak ada periode aktif dan
  rentangnya tidak bertumpang tindih dengan periode yang sudah ditutup.
- Menutup periode: periode berjalan diberi `closed: true`, lalu periode baru dapat dibuat
  mulai H+1 dari `end` sepanjang satu bulan dengan nama yang diisi pengguna.
- Jika sudah ada periode draft setelah periode berjalan, pengguna dapat melanjutkan ke
  draft tersebut alih-alih membuat periode baru. Anggaran pilihan di-upsert ke draft;
  kategori yang sudah ada diperbarui dan anggaran draft lainnya tetap dipertahankan.
- Periode **tidak boleh diduplikat** (harus unik); tombol duplikat disembunyikan.
- Daftar periode diurutkan dari yang terbaru.

---

## 12. Notifikasi

Dibangun dari data nyata setiap kali data berubah:

| Sumber | Muncul bila |
| --- | --- |
| Langganan | `0 ≤ hari menuju tagihan ≤ reminderDaysBefore`. |
| Langganan | akan berakhir dalam ≤14 hari. |
| Pengingat | belum selesai dan jatuh tempo ≤3 hari lagi (termasuk yang telat). |
| Anggaran | `spent > allocated`. |

Notifikasi dihasilkan job PostgreSQL harian dan status baca disimpan per user/workspace
di tabel `notifications`; membuka panel lonceng **tidak** menandai apa pun. Perubahan status
baca tersinkron realtime dan lonceng menampilkan jumlah yang belum dibaca.

---
