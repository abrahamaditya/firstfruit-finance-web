# FirstFruit Finance

Aplikasi keuangan personal dan keluarga berbasis Next.js, Supabase Auth, dan PostgreSQL.
Seluruh nominal disimpan sebagai integer Rupiah (`*_minor`), mutasi finansial dicatat
dengan double-entry ledger, dan akses data dibatasi per workspace melalui Row Level Security.

## Setup dengan Supabase Cloud

Prasyarat: Node.js 20.9+, npm, dan project Supabase Cloud.

```bash
npm install
npm run supabase:login
npm run supabase:link -- --project-ref <PROJECT_REF>
```

Salin `.env.example` menjadi `.env.local`, lalu isi URL dan publishable key dari
**Supabase Dashboard > Project Settings > API**. Service-role key tidak diperlukan
oleh aplikasi browser.

```bash
npm run db:push:dry
npm run db:push
npm run dev
```

Aplikasi tersedia di `http://localhost:3000` dan memakai database Supabase Cloud
yang sudah ditautkan. Docker dan database lokal tidak diperlukan.

## Verifikasi

```bash
npm run typecheck
npm run build
npm run db:lint
npm run db:test
```

Untuk memperbarui tipe TypeScript setelah skema berubah:

```bash
npm run db:types
```

## Arsitektur

```text
src/
├─ core/                         domain types, kalkulasi, dan repository ports
├─ application/                  hooks/use-cases
├─ infrastructure/
│  ├─ supabase/                  auth client dan repository PostgreSQL
│  └─ memory/                    test double lokal, bukan runtime production
├─ components/                   app shell dan UI primitives
├─ features/                     layar per fitur
└─ app/                          Next.js App Router

supabase/
├─ migrations/                   skema, RLS, ledger, RPC, view, split bill, cron
├─ tests/database/               pgTAP database tests
├─ config.toml                   konfigurasi project Supabase CLI
└─ seed.sql                      taxonomy sistem, tanpa data finansial pengguna
```

Runtime production selalu memakai Supabase. Tidak ada fallback diam-diam ke data demo
ketika konfigurasi atau autentikasi gagal.

## Proses bisnis penting

- Registrasi membuat profil, personal workspace, owner membership, akun ledger, preferensi,
  dan periode aktif secara otomatis.
- Posting transaksi, perubahan saldo, transfer, pembayaran kartu, alokasi anggaran,
  pembentukan/pelunasan piutang, serta penyisihan tabungan berjalan melalui RPC atomik.
- Transaksi posted bersifat immutable. Koreksi memakai reversal atau replace, bukan edit
  langsung.
- Tutup buku membuat snapshot dan periode berikutnya dalam satu transaksi database.
- Split bill menyimpan peserta, nota, item, pajak, pembagian, dan settlement; finalisasi
  menghitung hasil di server dan membuat piutang yang relevan secara idempoten.
- Preferensi, profil, notifikasi, dan status baca disimpan per user/workspace.
- Realtime menyegarkan read model ketika anggota workspace lain membuat perubahan.
- Cron harian membuat notifikasi tagihan, reminder, masa akhir langganan, dan budget overrun.

## Keamanan

- Supabase Auth memakai cookie SSR yang diperbarui melalui middleware.
- Semua tabel tenant mengaktifkan RLS; role workspace adalah `owner`, `editor`, atau `viewer`.
- Fungsi bisnis `security definer` selalu memvalidasi membership/role dan menggunakan
  idempotency key.
- Client tidak memperoleh service-role key.
- Bucket lampiran transaksi bersifat private, dibatasi 10 MiB dan tipe file tertentu.
- CVV/PAN penuh tidak disimpan; aplikasi hanya menyimpan identitas masked yang diperlukan.

## Dokumentasi

- [Aturan bisnis](docs/business-logic.md)
- [Skema domain](docs/schema.md)
- [Rencana implementasi Supabase/PostgreSQL](docs/supabase-postgresql-plan.md)

## Deployment Supabase Cloud

1. Buat project Supabase dan hubungkan CLI: `npm run supabase:link -- --project-ref <ref>`.
2. Atur URL aplikasi dan redirect Auth di dashboard.
3. Periksa migration dengan `npm run db:push:dry`, lalu jalankan `npm run db:push`.
4. Isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` di hosting.
5. Deploy aplikasi. `SUPABASE_SERVICE_ROLE_KEY` hanya diperlukan oleh proses server tepercaya,
   bukan oleh browser atau alur aplikasi saat ini.

`db:lint`, `db:test`, dan `db:types` dijalankan langsung terhadap project yang
ditautkan. `db:test` memakai Management API (`db query --linked`) sehingga tidak
memerlukan Docker atau PostgreSQL lokal. Untuk keamanan, jalankan pgTAP pada project
staging sebelum production.

`db:lint` tetap menggagalkan error nyata. Satu false-positive `plpgsql_check` yang
terdokumentasi untuk temporary table internal split bill difilter secara spesifik;
jalur runtime tersebut diuji oleh suite pgTAP split bill.
