# Abraham Finance — Next.js + TypeScript

Aplikasi manajemen keuangan pribadi (bahasa Indonesia, dark emerald UI) di atas arsitektur
berlapis. Berjalan langsung dengan **data contoh in-memory** — tanpa Firebase — lalu siap
di-swap ke Firestore tanpa menyentuh UI.

Dokumen pendamping:

- [`docs/business-logic.md`](docs/business-logic.md) — aturan bisnis lengkap per fitur (sumber kebenaran untuk perilaku).
- [`docs/schema.md`](docs/schema.md) — skema data, relasi antar-entitas, dan catatan migrasi.
- [`docs/supabase-postgresql-plan.md`](docs/supabase-postgresql-plan.md) — blueprint Supabase/PostgreSQL, ledger, RLS, RPC, migrasi, pengujian, dan rollout.

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

## Peta arsitektur

```
src/
├─ core/
│  ├─ domain/                LOGIKA BISNIS MURNI (tanpa React/Firebase, mudah diuji)
│  │  ├─ types.ts            entitas domain
│  │  ├─ money.ts            format IDR/USD + konversi kurs
│  │  ├─ calculations.ts     totalLiquidity, safeToSpend, budgetView, periodProgress, tabungan
│  │  ├─ subscription.ts     nextBillingDate, isReminderDue, isEndingSoon, monthlyCost
│  │  ├─ categories.ts       taksonomi kategori 3 tingkat + indeks jalur + saran merchant
│  │  ├─ calendar.ts         grid bulan/minggu, dayKey, billingDatesInRange
│  │  ├─ planning.ts         4 metode simulasi keuangan
│  │  └─ split.ts            split bill per nota (pajak per item, settle-up)
│  └─ ports/                 KONTRAK repository (interface)
├─ infrastructure/
│  ├─ memory/                implementasi in-memory (default, data contoh)
│  ├─ firebase/              implementasi Firestore (siap diaktifkan) + client.ts
│  ├─ seed.ts                data contoh
│  └─ RepositoryProvider.tsx pilih driver via env (memory | firebase)
├─ application/
│  └─ hooks.ts               USE-CASE: useDashboard, useWallets, usePlanningContext, dst.
├─ components/               AppShell (navigasi, sheet, form engine), ikon
├─ features/                 layar sebagai komponen
└─ app/                      Next.js App Router (layout, page, globals.css)
functions/subscriptionReminders.ts   scheduled CF (reminder-only, tanpa auto-charge)
firestore.rules                      keamanan: owner/collaborator; CVV tidak disimpan
```

Aturan utama: **UI → hooks → repository (interface) → infrastruktur**.
Logika keuangan hidup di `core/domain` dan tidak pernah impor Firebase atau React.

## Fitur

### Dompet & saldo

- Jenis dompet: **rekening/kartu debit, kartu kredit, e-wallet, uang tunai**. Field ikut menyesuaikan
  (e-wallet minta nomor HP, bukan 4 digit rekening; limit kredit hanya untuk kartu kredit).
- Kartu di layar Dompet berupa **carousel swipe** dengan indikator titik; kartu non-aktif mengecil.
- **Tabungan (sinking fund)**: uang nyata yang dikunci di dalam sebuah dompet debit — saldo dompet
  tidak berubah, tapi jumlah itu dikurangkan dari "aman dibelanjakan".
- **Dompet default** (Profil): jadi isian awal form dan tujuan pemindahan saldo saat dompet dihapus.
- Setiap perubahan nominal meninggalkan jejak: edit saldo manual dan penghapusan dompet
  **selalu membuat transaksi** (lihat "Jejak penyesuaian" di `docs/business-logic.md`).

### Transaksi

- **Satu form** untuk pengeluaran / pemasukan / transfer antar-dompet; field menyesuaikan jenisnya.
- **Kategori 3 tingkat**: kelompok besar → kategori → spesifik (114 kategori spesifik pengeluaran,
  38 pemasukan) dengan pilihan bertingkat dan opsi kategori bebas.
- **Tempat transaksi** (Indomaret, Shopee, kaki lima, …) dengan saran otomatis.
- **Pihak terkait** dari daftar penerima (Gereja, Keluarga, nama orang) — bisa ditambah langsung dari form.
- Pengeluaran bisa **dibebankan ke pos anggaran** (realisasi anggaran otomatis naik).
- Pemasukan bisa **melunasi piutang** (dipilih manual atau dicocokkan otomatis).
- Transfer bisa langsung **menyisihkan uangnya ke tabungan** di dompet tujuan.
- Pengeluaran untuk orang lain otomatis menjadi **piutang** (talangin penuh / patungan sebagian).

### Anggaran

- Alokasi per kategori, progres, dan status defisit.
- **Simulasi jatah**: jatah per hari & per minggu dari sisa anggaran, plus indikator laju
  (hemat / kecepatan / jebol) dan jatah harian per kategori.

### Kalender & pengingat

- Tampilan **bulanan / mingguan**, penanda warna per tanggal, toggle tampilkan transaksi.
- **To-do / reminder** bertanggal dengan nominal opsional, bisa dicentang selesai.
- Terintegrasi otomatis dengan **jatuh tempo langganan** (dihitung dari siklusnya).

### Langganan

- Beban bulanan total, peringatan akan ditagih & akan berakhir, **tanggal asli** selain hitungan hari.

### Piutang & split bill

- Piutang dengan pembayaran sebagian, tautan ke transaksi yang melunasinya.
- **Split bill per nota**: banyak nota, siapa yang menalangi, item per nota dengan **pajak per item**,
  hasil akhir berupa saldo tiap orang + daftar "siapa transfer ke siapa" yang paling sedikit.

### Rencana keuangan (4 metode)

1. **Target dana** — berapa lama & berapa per bulan; termasuk arah sebaliknya (deadline → setoran).
2. **Sanggup beli?** — cek harga terhadap arus bulan depan (gaji − anggaran − tagihan terjadwal).
3. **Belanja dadakan** — dampak ke sisa anggaran dan jatah harian.
4. **Target sisa** — pemotongan anggaran proporsional agar akhir periode tersisa sekian.

### Laporan

- Metrik pemasukan / pengeluaran / arus kas bersih dengan warna berbeda.
- **Laporan harian** (per tanggal, bar masuk-keluar, rata-rata belanja/hari).
- Analisa kategori pada **tiga tingkat** (besar / kategori / spesifik).
- Ekspor CSV dengan kolom kategori terpisah per tingkat.

### Periode & tutup buku

- Kartu transisi: periode yang ditutup → periode baru yang dibuka (nama + rentang tanggal).
- **Daftar periode** dengan status berjalan/ditutup.

### Lain-lain

- Notifikasi dari data nyata (tagihan, langganan berakhir, pengingat, anggaran jebol) dengan
  **tombol tandai dibaca per item** dan "tandai semua"; status bertahan di localStorage.
- Bilingual **ID/EN**, mata uang **IDR/USD** dengan kurs live harian, tema gelap/terang.

## Mengaktifkan Firebase

1. `npm install firebase`
2. Isi `.env.local` (lihat `.env.example`) dengan kredensial proyek.
3. Buka komentar `infrastructure/firebase/client.ts` dan `infrastructure/firebase/repositories.ts`.
4. Di `RepositoryProvider.tsx`, aktifkan baris `createFirestoreRepositories()`.
5. Set `NEXT_PUBLIC_REPOSITORY_DRIVER=firebase`.
6. Deploy `firestore.rules` dan fungsi terjadwal di `functions/`.

Koleksi Firestore mengikuti nama pada `DataRepositories`: `wallets`, `transactions`, `budgets`,
`periods`, `subscriptions`, `receivables`, `plans`, `savings`, `reminders`, `beneficiaries`.

## Keamanan

- **CVV tidak pernah disimpan.** Nomor kartu & rekening disimpan terenkripsi (kunci di Secret Manager),
  ditampilkan masked (4 digit terakhir).
- Security Rules membatasi akses ke owner / collaborator.

## Notifikasi

- In-app (panel lonceng) + **web push (FCM)** — termasuk ke HP via PWA.
- `functions/subscriptionReminders.ts` membuat notifikasi "akan ditagih" & "akan berakhir". Reminder-only,
  tidak pernah melakukan penagihan otomatis.

## Catatan implementasi

- Preferensi (tema, bahasa, mata uang, dompet default) disimpan di `localStorage` key `abraham.prefs`.
- Kurs USD↔IDR di-cache di `abraham.fx`; nilai selalu disimpan dalam Rupiah, USD hanya tampilan.
- Split bill masih state lokal layar (belum dipersistensi); hasil akhirnya yang dituliskan sebagai piutang.
"# firstfruit-finance-web" 
