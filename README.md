# FirstFruit Finance

FirstFruit Finance adalah aplikasi keuangan pribadi dan keluarga yang memakai Next.js,
Supabase Auth, dan PostgreSQL. Pengguna mencatat transaksi, mengelola dompet dan kartu
kredit, menyusun anggaran per periode, serta membaca laporan arus kas dan pola dari
periode yang sudah ditutup. Antarmuka mendukung ponsel dan desktop.

> **Status repositori:** aplikasi dapat dijalankan terhadap project Supabase yang
> skemanya **sudah disiapkan**. Riwayat migrasi awal, sebagian tes database,
> `supabase/config.toml`, dan `supabase/seed.sql` masih dikecualikan dari Git pada
> snapshot ini. Karena itu, checkout bersih **belum cukup** untuk membangun database
> Supabase baru dari nol. Jangan menjalankan `db:push` pada project baru dengan hanya
> berkas yang terlacak saat ini. Lihat [Alur perubahan database](#alur-perubahan-database).

## Kemampuan utama

| Area | Perilaku |
| --- | --- |
| Akun dan workspace | Supabase Auth; data dipisahkan per workspace dengan peran `owner`, `editor`, dan `viewer`. |
| Dompet | Rekening, e-wallet, tunai, tabungan yang disisihkan, dan kartu kredit. Perubahan saldo memiliki jejak transaksi. |
| Transaksi | Pemasukan, pengeluaran, transfer, kategori bertingkat, hubungan ke anggaran, pembayaran kartu, dan pelunasan piutang. |
| Cicilan kartu | Input nominal per bulan **atau** harga barang ditambah bunga total. Jadwal bulanan, progres pelunasan, dan sisa limit memperhitungkan cicilan yang belum lunas lintas periode. |
| Anggaran | Alokasi dan realisasi per periode, termasuk tagihan cicilan otomatis. Proyeksi akhir periode memakai pola kategori dari hingga tiga periode selesai; tanpa riwayat, alokasi menjadi acuan awal. |
| Langganan dan kalender | Jadwal tagihan berulang, termasuk tanpa tanggal akhir, serta pengingat. Menambah langganan **tidak** otomatis membuat transaksi pembayaran. |
| Piutang dan split bill | Pencatatan tagihan, pembayaran, pembagian biaya, dan penyelesaian yang relevan. |
| Laporan | Arus kas, kategori, sumber dana, kesehatan keuangan, realisasi anggaran, dan submenu **Pola**. Pola membandingkan hingga delapan periode selesai dengan nominal per hari agar durasi berbeda tetap sebanding. |
| Preferensi | Tema, bahasa, mata uang tampilan, notifikasi, dan pilihan dompet default. |

Semua nominal sumber disimpan sebagai **integer Rupiah** di database; nama kolom SQL
`*_minor` tidak berarti sen. Tampilan USD hanya hasil konversi dan tidak mengubah
nominal dasar. Posting finansial penting diproses melalui fungsi database dalam
transaksi atomik. Transaksi yang sudah diposting dikoreksi melalui alur koreksi/reversal,
bukan dengan mengubah jurnalnya secara langsung.

## Teknologi dan struktur

- Next.js 16 App Router, React 18, TypeScript, dan CSS aplikasi.
- Supabase untuk Auth, PostgreSQL, Row Level Security (RLS), Realtime, dan fungsi/RPC
  bisnis. Runtime aplikasi memakai Supabase; repository memori hanya untuk pengembangan
  atau pengujian terisolasi.
- PWA dan web push tersedia bila konfigurasi layanan pendukungnya sudah dipasang.

```text
src/app/                    route, layout, metadata, dan CSS
src/components/             app shell, navigasi, form, komponen UI
src/features/               layar fitur (termasuk Laporan dan Pola)
src/application/            hooks dan penggabungan data untuk UI
src/core/domain/            tipe, kalkulasi murni, aturan bisnis
src/core/ports/             kontrak repository
src/infrastructure/supabase/ Auth, client, pemetaan data, repository
src/infrastructure/memory/   implementasi repository non-production
scripts/                    lint dan tes database Supabase Cloud
tests/                      tes logika domain dengan Node.js
supabase/migrations/         perubahan skema dan fungsi database
supabase/tests/database/     suite pgTAP (sebagian belum terlacak Git)
docs/                       dokumentasi desain dan aturan bisnis terdahulu
```

Aliran data utama: **layar → application hooks → repository → Supabase/RPC**. Aturan
perhitungan yang dapat berdiri sendiri ditempatkan di `src/core/domain`, sehingga UI
tidak menjadi satu-satunya tempat aturan finansial didefinisikan.

## Menjalankan aplikasi lokal

Prasyarat: Node.js **20.9+** (minimum Next.js yang terpasang), npm, dan akses ke
project Supabase yang sudah memiliki skema aplikasi. Gunakan Node.js **24** bila ingin
menjalankan tes domain `.ts` dengan perintah di bawah. Docker atau PostgreSQL lokal
tidak diperlukan untuk menjalankan web terhadap Supabase Cloud.

1. Pasang dependensi sesuai lockfile dan buat konfigurasi lingkungan:

   ```bash
   npm ci
   cp .env.example .env.local
   ```

2. Isi `.env.local` dari **Supabase Dashboard → Project Settings → API**:

   | Variabel | Kebutuhan | Keterangan |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Wajib | URL project Supabase yang skemanya siap. |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Wajib | Kunci publishable untuk client. Kode juga menerima `NEXT_PUBLIC_SUPABASE_ANON_KEY` sebagai kompatibilitas lama. |
   | `NEXT_PUBLIC_SITE_URL` | Opsional | Origin kanonis untuk metadata; default lokal `http://localhost:3000`. |

   Awalan `NEXT_PUBLIC_` berarti nilainya tersedia di browser. **Jangan** menaruh
   service-role key, token CLI, atau rahasia lain pada variabel tersebut atau di Git.
   `.env.local` diabaikan oleh Git.

3. Jalankan server:

   ```bash
   npm run dev
   ```

   Buka <http://localhost:3000>. Login/registrasi mengikuti pengaturan Auth pada project
   Supabase. Jika login memakai tautan email atau redirect, daftarkan URL lokal yang
   sesuai pada pengaturan Auth project tersebut. Tanpa konfigurasi Supabase, aplikasi
   tidak mengganti data dengan demo secara diam-diam.

## Perintah verifikasi

| Perintah | Tujuan | Memakai project tertaut? |
| --- | --- | :---: |
| `npm run typecheck` | Memeriksa tipe TypeScript. | Tidak |
| `npm run build` | Build produksi Next.js, termasuk pemeriksaan tipe. | Tidak |
| `node --experimental-strip-types --test tests/period-patterns.test.mjs` | Tes proyeksi anggaran dan pola periode. | Tidak |
| `npm run db:status` | Membandingkan riwayat migrasi lokal dan remote. | Ya |
| `npm run db:lint` | Memeriksa fungsi PostgreSQL melalui Supabase CLI. | Ya |
| `npm run db:test` | Menjalankan berkas pgTAP di `supabase/tests/database`. | Ya |
| `npm run db:types` | Membuat ulang `database.types.ts` dari skema `public`. | Ya |

Tes pgTAP yang tersedia di direktori lokal memakai `BEGIN`/`ROLLBACK`, tetapi perintah
`db:test` **tetap terhubung ke database remote**. Jalankan pada staging lebih dulu dan
periksa project yang sedang tertaut. Skrip menjalankan semua berkas `.sql` yang ada
secara berurutan; jumlah suite pada checkout bersih dapat berbeda karena sebagian berkas
belum terlacak Git. `db:lint` melewatkan satu false-positive yang diketahui untuk
temporary table internal split bill; error lain tetap dilaporkan.

## Alur perubahan database

Perintah berikut **mengubah atau membaca project Supabase yang tertaut**, bukan database
lokal. Pisahkan staging dan production; jangan memakai project production untuk
eksperimen migrasi.

1. Pastikan konfigurasi Supabase CLI tersedia. Pada snapshot ini
   `supabase/config.toml` ada di lingkungan pengembangan lama, tetapi belum terlacak
   Git. Untuk checkout baru, siapkan konfigurasi CLI project lebih dulu.
2. Autentikasi dan tautkan CLI ke project **staging** yang dimaksud:

   ```bash
   npm run supabase:login
   npm run supabase:link -- --project-ref <PROJECT_REF_STAGING>
   npm run db:status
   ```

3. Tambahkan migrasi baru yang berurutan; jangan mengubah migrasi yang sudah diterapkan.
   Saat merancang fungsi finansial, sertakan validasi otorisasi workspace, idempotensi,
   RLS, dan tes untuk perubahan saldo/anggaran. Jalankan `typecheck`, tes domain,
   `db:lint`, dan `db:test` yang relevan.
4. **Setelah riwayat migrasi lokal dilengkapi dan cocok dengan remote**, tinjau rencana
   perubahan sebelum menerapkan:

   ```bash
   npm run db:push:dry
   npm run db:push
   npm run db:types
   npm run typecheck
   ```

   `db:push` juga memakai `--include-seed`. Seed yang dimaksud hanya data referensi,
   bukan data finansial pengguna. Simpan cadangan database dan rencana pemulihan sebelum
   migrasi ke production.

**Keterbatasan snapshot Git:** berkas migrasi awal sebelum `202608260058` dan beberapa
migrasi sesudahnya belum semuanya terlacak, walaupun sebagian ada di direktori kerja
lokal/riwayat remote. `202609280070` juga dapat muncul di riwayat remote tanpa berkas
lokal yang sesuai. Lengkapi dan rekonsiliasi rantai migrasi ini sebelum mencoba
bootstrap project baru atau `db:push` dari checkout bersih. Menandai versi sebagai
“applied” secara manual tanpa menerapkan SQL-nya bukan pengganti rekonsiliasi.

## Prinsip data dan keamanan

- Setiap data finansial berada dalam workspace. RLS dan pemeriksaan keanggotaan di RPC
  membatasi akses menurut peran; jangan mengandalkan penyembunyian tombol di UI sebagai
  batas keamanan.
- Transaksi posted memiliki jejak ledger. Koreksi saldo, pembayaran kartu, cicilan,
  piutang, dan tutup buku harus menjaga keseimbangan serta idempotensi.
- Langganan adalah jadwal/pengingat; transaksi pembayaran dicatat terpisah. Begitu pula
  nilai historis harga barang dan bunga cicilan tidak diisi dengan angka rekaan saat
  metadata lama belum tersedia.
- Laporan membedakan arus kas riil dari transfer, penyesuaian saldo, dan pelunasan
  piutang. Proyeksi anggaran adalah **estimasi**, bukan komitmen pembayaran; ia memakai
  riwayat kategori yang cocok jika ada, atau alokasi sebagai acuan bila belum ada.
- Nomor kartu penuh dan CVV tidak disimpan. Jangan menambahkan kunci rahasia ke client,
  seed, berkas tes, log, atau contoh konfigurasi.

## Deployment

Siapkan project Supabase beserta migrasi dan pengaturan Auth lebih dulu. Pada hosting
Next.js, isi variabel `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dan `NEXT_PUBLIC_SITE_URL` dengan nilai
lingkungan deployment. Atur **Site URL** serta redirect yang diperlukan pada Supabase
Auth, lalu jalankan build dan uji login, workspace, transaksi, dan laporan pada staging.
Pindahkan perubahan database dan aplikasi ke production melalui proses rilis yang
terkontrol. Web push memerlukan fungsi dan secret server terpisah; build web saja tidak
menyiapkan pengiriman push.

## Dokumentasi terkait

- [Aturan bisnis](docs/business-logic.md)
- [Skema domain](docs/schema.md)
- [Rencana Supabase/PostgreSQL](docs/supabase-postgresql-plan.md)

Aturan bisnis dan skema domain di atas menjelaskan implementasi saat ini. Dokumen
rencana Supabase/PostgreSQL juga memuat keputusan desain lama; cocokkan dengan kode
dan tes sebelum mengubah aturan finansial.
