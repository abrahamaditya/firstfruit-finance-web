# FirstFruit — Supabase PostgreSQL Implementation Plan

Status: architecture and implementation blueprint  
Scope: seluruh proses bisnis yang saat ini ada di aplikasi FirstFruit  
Target: aplikasi multi-user production-grade dengan Supabase Auth, PostgreSQL, Row Level Security, Realtime, Storage, Cron, dan database migrations

---

## 1. Keputusan arsitektur

PostgreSQL menjadi **sumber kebenaran tunggal** untuk data finansial. Supabase dipakai sebagai platform untuk:

- PostgreSQL;
- Authentication;
- Row Level Security (RLS);
- Realtime untuk sinkronisasi antarperangkat;
- Storage untuk lampiran privat bila fitur itu ditambahkan;
- Cron dan Edge Functions untuk pengingat/push notification;
- backup dan observability.

Prinsip yang tidak boleh dilanggar:

1. Setiap data bisnis harus mempunyai `workspace_id`.
2. Hak akses berasal dari membership workspace, bukan field `owner_id` yang bebas diubah pada setiap record.
3. Transaksi keuangan yang sudah diposting tidak diedit atau dihapus secara fisik.
4. Koreksi dilakukan melalui reversal dan, bila diperlukan, transaksi pengganti.
5. Semua efek satu aksi bisnis harus committed dalam satu PostgreSQL transaction.
6. Nominal disimpan sebagai integer Rupiah (`bigint`), bukan floating point.
7. Saldo, realisasi anggaran, dan sisa piutang harus dapat direkonsiliasi dari ledger.
8. Operasi kritis hanya tersedia melalui database function/RPC yang eksplisit.
9. Tabel pada schema yang diekspos wajib memakai RLS.
10. Perubahan schema hanya melalui versioned migration, tidak melalui perubahan manual production.

Firestore tidak perlu diaktifkan. Folder `src/infrastructure/firebase` dan `firestore.rules` baru dihapus setelah cutover Supabase selesai dan lolos regression test.

---

## 2. Batas produk dan asumsi V1

Plan ini menggunakan asumsi berikut:

- Satu pengguna otomatis memiliki satu workspace personal.
- Pengguna dapat mempunyai beberapa workspace di masa depan, misalnya personal dan keluarga.
- Role workspace: `owner`, `editor`, dan `viewer`.
- Mata uang sumber kebenaran V1 adalah IDR; tampilan USD hanya konversi.
- Satu workspace hanya mempunyai satu periode terbuka.
- Periode yang sudah ditutup immutable.
- Budget periode berikutnya dapat disalin dari struktur periode sebelumnya, tetapi `spent` selalu dimulai dari nol.
- CVV dan nomor kartu/rekening penuh tidak disimpan.
- Split bill disimpan sebagai draft agar bisa dilanjutkan dari perangkat lain.
- Langganan hanya membuat reminder; tidak melakukan auto-charge.
- Posting finansial saat offline disimpan sebagai draft lokal dan baru dianggap berhasil setelah server mengonfirmasi.

Perubahan asumsi harus dicatat sebagai Architecture Decision Record sebelum implementasi terkait dimulai.

---

## 3. Arsitektur aplikasi target

```text
Browser / PWA
  ├─ Supabase Auth session
  ├─ read query ber-RLS
  ├─ Realtime subscription terfilter
  └─ business command melalui RPC
          │
          ▼
Supabase
  ├─ Auth
  ├─ PostgreSQL + RLS
  ├─ database functions (atomic commands)
  ├─ Realtime
  ├─ Cron
  ├─ Edge Functions (push/external network)
  └─ Storage (private attachments)
```

Pemisahan schema:

```text
public
  tabel dan view yang boleh diakses Data API dengan RLS

private
  helper authorization, internal posting functions, dan data internal
  yang tidak diekspos melalui Data API

auth
  dikelola Supabase Auth

storage
  dikelola Supabase Storage
```

Untuk aplikasi Next.js:

```text
src/infrastructure/supabase/
  browser.ts
  server.ts
  middleware.ts
  database.types.ts
  queries/
  commands/
  mappers/

src/application/
  queries/
  commands/
  view-models/

src/core/domain/
  tetap bebas dari Supabase, React, dan I/O
```

Generic repository `create/update/remove` tidak boleh menjadi API utama untuk proses finansial. Ganti dengan query service dan business command yang menyatakan intent.

---

## 4. Konvensi database

### 4.1 Tipe dasar

- Primary key: `uuid default gen_random_uuid()`.
- Waktu kejadian: `occurred_at timestamptz`.
- Waktu audit server: `created_at timestamptz default now()`.
- Tanggal periode/target: `date`.
- Nominal: `bigint`, nama kolom berakhiran `_minor`.
- Kurs: `numeric(20, 8)`.
- Mata uang: `char(3)`.
- Soft delete/master data: `archived_at timestamptz`.
- Optimistic concurrency untuk data non-ledger: `version integer`.

Walaupun IDR tidak mempunyai pecahan, akhiran `_minor` tetap digunakan agar kontrak money tidak ambigu bila multi-currency ditambahkan.

### 4.2 Kolom standar tabel bisnis

Mayoritas tabel workspace mempunyai:

```text
id
workspace_id
created_at
created_by
updated_at
updated_by
version
```

Tabel append-only tidak membutuhkan `updated_at`, kecuali status posting yang hanya dapat diubah fungsi internal.

### 4.3 Foreign key lintas workspace

Relasi penting harus mencegah record workspace A mereferensikan record workspace B. Gunakan salah satu:

- composite unique `(workspace_id, id)` dan composite foreign key;
- trigger internal tervalidasi;
- validasi dan row lock dalam RPC untuk relasi yang kompleks.

Validasi frontend tidak pernah dianggap sebagai pengamanan database.

---

## 5. Catalog schema

### 5.1 Pengguna, workspace, dan akses

#### `profiles`

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `display_name text`
- `avatar_path text`
- `created_at`, `updated_at`

Profil tidak menyimpan role.

#### `workspaces`

- `id`
- `name`
- `kind`: `personal | family`
- `base_currency char(3) default 'IDR'`
- `timezone text default 'Asia/Jakarta'`
- `status`: `active | suspended | closing | deleted`
- `created_by`
- timestamps

#### `workspace_members`

- `workspace_id`
- `user_id`
- `role`: `owner | editor | viewer`
- `status`: `active | revoked`
- `joined_at`
- primary key `(workspace_id, user_id)`

Index wajib:

- `(user_id, workspace_id)` untuk RLS;
- `(workspace_id, role)` untuk administrasi anggota.

#### `workspace_invitations`

- `workspace_id`
- `email_normalized`
- `role`
- `token_hash`
- `expires_at`
- `accepted_at`
- `invited_by`

Token mentah tidak disimpan. Invite hanya dapat dibuat owner melalui RPC.

#### `user_workspace_preferences`

- primary key `(user_id, workspace_id)`
- `language`: `ID | EN`
- `display_currency`: `IDR | USD`
- `theme`: `light | dark | system`
- `default_wallet_id`
- `hide_home_amounts`
- `notification_preferences jsonb`

Preferensi pindah dari `localStorage` agar sinkron antarperangkat. Theme dapat tetap dicache lokal untuk mencegah flash saat render.

### 5.2 Kategori dan pihak terkait

#### `categories`

- `id`
- `workspace_id nullable`: `null` untuk kategori sistem
- `flow_type`: `expense | income`
- `parent_id`
- `depth`: 1–3
- `name`
- `normalized_name`
- `sort_order`
- `is_system`
- `archived_at`

Constraint:

- parent harus memiliki `flow_type` sama;
- depth anak = depth parent + 1;
- depth antara 1 dan 3;
- nama aktif unik dalam parent/workspace;
- kategori sistem tidak dapat dimutasi user.

Taksonomi yang sekarang berada di TypeScript menjadi seed database. Domain tetap dapat membawa fallback agar UI tidak rusak saat boot.

#### `beneficiaries`

- `workspace_id`
- `name`
- `normalized_name`
- `kind`: `person | family | church | organization | business`
- `note`
- `archived_at`

Nama tidak harus global-unique, tetapi UI memberi peringatan jika ada nama aktif yang sama.

### 5.3 Wallet dan chart of accounts

#### `ledger_accounts`

- `workspace_id`
- `code`
- `name`
- `account_class`: `asset | liability | equity | income | expense | receivable`
- `normal_side`: `debit | credit`
- `system_key nullable`
- `wallet_id nullable`
- `archived_at`

System account minimum per workspace:

- `EQUITY_OPENING_BALANCE`
- `EQUITY_BALANCE_ADJUSTMENT`
- `INCOME_GENERAL`
- `EXPENSE_GENERAL`
- `ACCOUNTS_RECEIVABLE`

Setiap wallet memiliki satu ledger account.

#### `wallets`

- `workspace_id`
- `ledger_account_id`
- `name`
- `wallet_class`: `asset | liability`
- `medium`: `bank | credit | ewallet | cash`
- `institution_name`
- `last4`
- `phone_masked`
- `currency_code`
- `current_balance_minor`
- `credit_limit_minor nullable`
- `archived_at`

Rules:

- `credit` harus `wallet_class = liability`;
- medium lain harus `wallet_class = asset`;
- `last4` maksimum empat digit;
- `current_balance_minor >= 0`;
- current balance hanya dapat diubah posting function;
- wallet yang pernah direferensikan tidak dihapus fisik.

Opening balance selalu diposting sebagai journal entry terhadap `EQUITY_OPENING_BALANCE`.

### 5.4 Ledger transaksi

#### `transactions`

- `workspace_id`
- `type`: `expense | income | transfer | credit_payment | adjustment`
- `status`: `posted | reversed`
- `nature`: `planned | unexpected | recurring | non_recurring`
- `amount_minor`
- `currency_code`
- `occurred_at`
- `period_id`
- `category_id nullable`
- `merchant text nullable`
- `beneficiary_id nullable`
- `beneficiary_mode`: `self | gift | lent | shared`
- `owed_amount_minor nullable`
- `subscription_id nullable`
- `split_bill_id nullable`
- `note`
- `reversal_of_id nullable`
- `replaced_by_id nullable`
- `idempotency_key`
- `created_by`
- `created_at`

Constraint:

- amount positif;
- owed amount antara 0 dan amount;
- `reversal_of_id` unik;
- `(workspace_id, idempotency_key)` unik;
- transaksi closed period tidak dapat dimutasi;
- row posted tidak dapat dihapus/update oleh client.

#### `transaction_lines`

- `transaction_id`
- `workspace_id`
- `ledger_account_id`
- `side`: `debit | credit`
- `amount_minor`
- `category_id nullable`
- `beneficiary_id nullable`
- `memo`

Posting function harus membuktikan:

```text
SUM(debit) = SUM(credit)
```

dan seluruh ledger account berada di workspace yang sama.

#### `transaction_budget_allocations`

- `transaction_id`
- `budget_id`
- `amount_minor`
- primary key `(transaction_id, budget_id)`

V1 UI boleh hanya memilih satu budget, tetapi struktur mendukung split allocation. Jumlah alokasi tidak boleh melebihi porsi expense milik pengguna.

#### `command_receipts`

- `workspace_id`
- `idempotency_key`
- `command_name`
- `request_hash`
- `result_entity_id`
- `created_by`
- `created_at`
- primary key `(workspace_id, idempotency_key)`

Retry dengan key dan request yang sama mengembalikan hasil lama. Key sama dengan payload berbeda harus ditolak.

### 5.5 Periode dan anggaran

#### `budget_periods`

- `workspace_id`
- `alias`
- `start_date`
- `end_date`
- `status`: `draft | open | closed`
- `closed_at`
- `closed_by`

Constraint/index:

- `end_date >= start_date`;
- partial unique index satu `status = 'open'` per workspace;
- period range tidak overlap dalam satu workspace;
- period closed immutable.

#### `budgets`

- `workspace_id`
- `period_id`
- `category_id`
- `allocated_minor`
- `notes`
- `archived_at`

Unique `(period_id, category_id)`.

`spent` tidak menjadi angka yang bebas diedit. Realisasi dihitung dari transaksi posted dan allocation. Bila performance membutuhkan cache, cache hanya diperbarui posting function dan memiliki reconciliation job.

#### `period_closing_snapshots`

- `period_id unique`
- total aset, liabilitas, tabungan, budget, pemasukan, pengeluaran, arus kas, dan surplus
- `generated_at`
- `generated_by`

#### `period_budget_snapshots`

- `period_id`
- `budget_id`
- `allocated_minor`
- `spent_minor`
- `remaining_minor`

Snapshot menjaga laporan penutupan tetap stabil walaupun kategori kemudian diarsipkan.

### 5.6 Tabungan/sinking fund

#### `savings_goals`

- `workspace_id`
- `wallet_id`
- `name`
- `target_minor`
- `target_date`
- `emoji`
- `archived_at`

Wallet harus asset dan berada dalam workspace yang sama.

#### `saving_movements`

- `workspace_id`
- `saving_id`
- `type`: `reserve | release | transfer_in | transfer_out | adjustment`
- `amount_minor`
- `transaction_id nullable`
- `occurred_at`
- `idempotency_key`
- `created_by`

Balance tabungan adalah jumlah movement bertanda, atau projection yang selalu dapat direkonsiliasi dari movement.

Invariant:

```text
total tabungan aktif dalam wallet <= saldo asset wallet
```

Pengecekan dilakukan dalam RPC dengan row lock pada wallet dan goal terkait.

### 5.7 Piutang

#### `receivables`

- `workspace_id`
- `beneficiary_id nullable`
- `person_snapshot`
- `source_transaction_id nullable`
- `source_type`: `manual | lent | shared | split_bill`
- `original_amount_minor`
- `due_date nullable`
- `status`: `open | partial | settled | written_off`
- `settled_at`
- `created_at`, `created_by`

#### `receivable_payments`

- `workspace_id`
- `receivable_id`
- `transaction_id unique`
- `amount_minor`
- `paid_at`

Paid dan remaining berasal dari SUM payment:

```text
paid = SUM(receivable_payments.amount_minor)
remaining = original_amount_minor - paid
```

Payment melebihi remaining ditolak. Auto-match hanya menjadi suggestion di UI; posting payment tetap membutuhkan receivable ID yang eksplisit.

### 5.8 Split bill

#### `split_bills`

- `workspace_id`
- `title`
- `status`: `draft | finalized | cancelled`
- `finalized_at`
- `created_by`

#### `split_participants`

- `split_bill_id`
- `beneficiary_id nullable`
- `name_snapshot`
- `is_current_user`
- `color`

#### `split_receipts`

- `split_bill_id`
- `name`
- `payer_participant_id`
- `tax_percent numeric(8,4)`

#### `split_items`

- `receipt_id`
- `name`
- `price_minor`

#### `split_item_shares`

- `item_id`
- `participant_id`
- `share_weight numeric default 1`

#### `split_settlements`

- `split_bill_id`
- `from_participant_id`
- `to_participant_id`
- `amount_minor`
- `receivable_id nullable`

`finalize_split_bill()`:

1. mengunci draft;
2. memvalidasi semua item mempunyai participant;
3. menghitung pajak proporsional;
4. menghitung net balance dan settlement;
5. menyimpan hasil;
6. membuat piutang yang menuju pengguna saat ini;
7. menandai finalized;
8. aman terhadap retry.

### 5.9 Langganan, reminder, dan notifikasi

#### `subscriptions`

- `workspace_id`
- `name`
- `amount_minor`
- `wallet_id`
- `category_id`
- `cycle`: `weekly | monthly | quarterly | yearly | custom`
- `custom_interval_days`
- `start_date`
- `end_date`
- `next_billing_date`
- `reminder_days_before`
- `status`: `active | paused | cancelled | ended`

#### `subscription_occurrences`

- `subscription_id`
- `billing_date`
- `amount_minor`
- `status`: `upcoming | reminded | paid | skipped`
- `transaction_id nullable`
- unique `(subscription_id, billing_date)`

Occurrence membuat kalender dan deduplication notifikasi lebih sederhana. Sistem tetap tidak melakukan auto-charge.

#### `reminders`

- `workspace_id`
- `title`
- `due_at`
- `amount_minor nullable`
- `note`
- `status`: `open | done | cancelled`
- `completed_at`, `completed_by`

#### `notifications`

- `workspace_id`
- `user_id`
- `type`
- `title`
- `body`
- `related_entity_type`
- `related_entity_id`
- `dedupe_key`
- `read_at`
- `created_at`
- unique `(user_id, dedupe_key)`

Cron harian:

1. membuat occurrence langganan yang diperlukan;
2. membuat notifikasi tagihan dan langganan berakhir;
3. membuat notifikasi reminder jatuh tempo;
4. membuat notifikasi budget overrun;
5. memanggil Edge Function untuk push notification;
6. mencatat job result dan error.

### 5.10 Rencana keuangan

#### `financial_plans`

- `workspace_id`
- `type`: `target_fund | affordability | unexpected_spend | target_leftover`
- `title`
- `status`: `draft | active | done`
- `inputs jsonb`
- `target_date nullable`
- timestamps

Plan adalah sandbox dan tidak memengaruhi ledger. Hasil simulasi dihitung dari input plan ditambah read model aktual. JSONB diperbolehkan di sini karena bentuk input empat metode berbeda dan tidak menjadi sumber kebenaran finansial.

### 5.11 Audit, kurs, dan file

#### `audit_events`

- `workspace_id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata jsonb` yang sudah direduksi dari data sensitif
- `ip_hash nullable`
- `created_at`

Append-only; client tidak dapat insert/update/delete langsung.

#### `exchange_rates`

- `base_currency`
- `quote_currency`
- `rate_date`
- `rate`
- `source`
- unique `(base_currency, quote_currency, rate_date)`

USD hanya tampilan. Nilai transaksi sumber tetap IDR.

#### `transaction_attachments`

Opsional pada V1:

- `transaction_id`
- `storage_path`
- `content_type`
- `size_bytes`
- `uploaded_by`

Gunakan private Storage bucket dan path yang diawali workspace ID.

---

## 6. Posting matrix

Saldo ledger menggunakan aturan:

- asset normal debit: `debit - credit`;
- liability normal credit: `credit - debit`;
- receivable normal debit;
- income normal credit;
- expense normal debit.

| Proses | Debit | Credit |
| --- | --- | --- |
| Opening saldo bank | Wallet asset | Equity opening |
| Expense dari bank/cash/e-wallet | Expense | Wallet asset |
| Expense kartu kredit | Expense | Wallet liability |
| Income masuk wallet | Wallet asset | Income |
| Transfer asset ke asset | Wallet tujuan | Wallet sumber |
| Bayar kartu kredit | Wallet liability | Wallet asset sumber |
| Talangin penuh | Accounts receivable | Wallet asset/liability sumber |
| Patungan | Expense sebesar bagian sendiri + receivable sebesar bagian orang lain | Wallet sumber |
| Gift | Expense | Wallet sumber |
| Pelunasan piutang | Wallet asset tujuan | Accounts receivable |
| Saldo asset dinaikkan manual | Wallet asset | Equity adjustment |
| Saldo asset diturunkan manual | Equity adjustment | Wallet asset |
| Tagihan liability dinaikkan manual | Equity adjustment | Wallet liability |
| Tagihan liability diturunkan manual | Wallet liability | Equity adjustment |

Transfer asset ke liability harus dianggap `credit_payment`, bukan transfer biasa. Transfer liability ke asset tidak didukung V1 kecuali dibuat sebagai proses cash advance yang eksplisit.

---

## 7. Business commands/RPC

### 7.1 Membership

- `create_workspace(name, kind, idempotency_key)`
- `invite_workspace_member(workspace_id, email, role)`
- `accept_workspace_invitation(token)`
- `change_workspace_member_role(workspace_id, user_id, role)`
- `remove_workspace_member(workspace_id, user_id)`
- `transfer_workspace_ownership(workspace_id, new_owner_id)`

Database tidak boleh mengizinkan workspace kehilangan owner terakhir.

### 7.2 Wallet

- `create_wallet(payload, opening_balance, idempotency_key)`
- `update_wallet_details(wallet_id, payload, expected_version)`
- `adjust_wallet_balance(wallet_id, target_balance, reason, idempotency_key)`
- `archive_wallet(wallet_id, destination_wallet_id, idempotency_key)`

Archive wallet:

- menolak bila ada transaksi pending;
- memindahkan saldo asset melalui transfer;
- membayar liability melalui credit payment;
- memindahkan atau menutup savings goal;
- mengarsipkan, bukan menghapus.

### 7.3 Transaction

- `post_expense(payload)`
- `post_income(payload)`
- `post_transfer(payload)`
- `post_credit_payment(payload)`
- `reverse_transaction(transaction_id, reason, replacement_payload?, idempotency_key)`

Setiap function:

1. memverifikasi membership dan role;
2. memverifikasi idempotency;
3. mengunci wallet/receivable/saving yang relevan;
4. menentukan open period dari `occurred_at`;
5. menolak write ke closed period;
6. membuat transaction header;
7. membuat balanced lines;
8. membuat budget allocation;
9. membuat/update piutang atau saving movement bila diperlukan;
10. memperbarui balance projection;
11. menulis audit event;
12. mengembalikan hasil setelah commit.

### 7.4 Budget dan periode

- CRUD budget pada open period dengan optimistic versioning.
- `close_budget_period(period_id, copy_budgets, idempotency_key)`
- `create_next_period(...)`

`close_budget_period()`:

1. advisory lock per workspace;
2. memastikan period masih open;
3. memastikan tidak ada command finansial pending;
4. membuat closing snapshot;
5. menutup period;
6. membuat next period;
7. opsional menyalin budget allocation;
8. menulis audit event;
9. commit atomik.

### 7.5 Savings

- `reserve_saving(saving_id, amount, idempotency_key)`
- `release_saving(saving_id, amount, idempotency_key)`
- `move_saving(saving_id, destination_wallet_id, idempotency_key)`
- `archive_saving(saving_id)`

Reserve/release adalah earmark movement dan tidak mengubah saldo wallet.

### 7.6 Receivable

- `create_manual_receivable(payload, idempotency_key)`
- `record_receivable_payment(receivable_id, wallet_id, amount, idempotency_key)`
- `write_off_receivable(receivable_id, reason, idempotency_key)`

Status open/partial/settled diturunkan dari payment aggregate, tidak dipercayakan pada payload client.

### 7.7 Split bill

- CRUD draft dengan RLS editor.
- `finalize_split_bill(split_bill_id, idempotency_key)`
- `cancel_split_bill(split_bill_id)`

### 7.8 Subscription/reminder/notification

- `record_subscription_payment(occurrence_id, wallet_id, idempotency_key)`
- `mark_reminder_done(reminder_id)`
- `mark_notification_read(notification_id)`
- `mark_all_notifications_read(workspace_id)`
- internal `generate_due_notifications(run_date)`

---

## 8. Mapping proses bisnis UI

### Beranda

Read model `dashboard_summary(workspace_id, period_id)` mengembalikan:

- asset balance;
- liability balance;
- net liquidity;
- reserved savings;
- remaining budget commitments;
- safe to spend;
- pemasukan/pengeluaran hari ini;
- safe per day;
- spending tujuh hari;
- sisa hari periode;
- wallet breakdown.

Rumus target:

```text
net_liquidity = total_asset_balance - total_liability_balance
remaining_budget = SUM(max(allocated - spent, 0))
safe_to_spend = net_liquidity - reserved_savings - remaining_budget
```

Karena wallet balance sudah mencerminkan transaksi, hanya **remaining budget** yang dikurangkan. Dengan demikian pengeluaran di dalam budget tidak dihitung dua kali.

### Dompet

- Daftar wallet membaca projection saldo.
- Membuat wallet dengan saldo awal selalu menghasilkan opening journal.
- Mengedit nama/bank/last4 tidak mengubah saldo.
- Mengedit saldo memanggil adjustment command.
- Delete pada UI menjadi archive workflow.

### Transaksi

- Daftar memakai cursor pagination berdasarkan `(occurred_at, id)`.
- Filter: period, type, wallet, category, beneficiary, adjustment.
- Create memakai posting RPC.
- Edit transaksi open period menjadi reverse + replacement.
- Delete menjadi reversal.
- Closed-period transaction read-only.

### Anggaran

- Budget terikat `period_id`.
- Spent berasal dari transaction allocation.
- Progress, velocity, per-day, dan overrun berasal dari view.
- Tidak ada input manual `spent` dalam form production.

### Tabungan

- Goal terkait asset wallet.
- Sisihkan/ambil membuat movement.
- Transfer + sisihkan dijalankan dalam satu command atomik.
- Saldo wallet tidak berubah hanya karena earmark.

### Piutang

- Talangin/shared otomatis membuat receivable dalam posting transaction.
- Payment membuat income/receivable journal dan payment row dalam satu commit.
- Total aktif memakai remaining, bukan original amount.
- Matching nama+nominal hanya suggestion; user memilih receivable sebelum posting.

### Pihak terkait

- Daftar orang/keluarga/gereja/organisasi/bisnis berasal dari `beneficiaries`.
- Ringkasan masuk, keluar, dan jumlah transaksi dihitung dari posted transaction.
- Beneficiary yang sudah dipakai di transaksi diarsipkan, bukan dihapus.
- Nama disimpan sebagai snapshot pada transaksi/piutang agar histori tidak berubah ketika master data diganti nama.

### Split bill

- Seluruh draft dipersistensi.
- Pajak tetap proporsional per item.
- Finalization immutable dan idempotent.
- Piutang dibuat hanya untuk settlement menuju pengguna/workspace.

### Langganan

- Billing occurrence dibuat terjadwal.
- Reminder tidak membuat expense otomatis.
- Saat pengguna menandai paid, expense diposting dan occurrence ditautkan.

### Kalender

Query rentang tanggal menggabungkan:

- transactions;
- subscription occurrences;
- reminders.

Gunakan tiga query terfilter atau satu security-invoker view/RPC; jangan load seluruh koleksi.

### Rencana keuangan

Empat kalkulator domain tetap pure.

Konteks server:

- current available liquidity;
- current period budgets;
- income rolling 31/90 hari;
- next-month occurrences/reminders;
- remaining receivables.

Menyimpan plan tidak mengubah ledger.

### Laporan

Sediakan RPC/read model:

- `report_cashflow(workspace, from, to, wallet_ids?)`;
- `report_daily(...)`;
- `report_categories(..., depth)`;
- `report_wallets(...)`;
- `report_adjustments(...)`;
- `report_receivables(...)`;
- `export_transactions(...)`.

Semua report:

- hanya transaksi posted;
- default mengecualikan reversal pair dari behavioral spending;
- dapat mengecualikan adjustment;
- memakai timezone workspace;
- menggunakan cursor/stream untuk export besar.

### Tutup buku

- Satu RPC atomik.
- Period snapshot immutable.
- Period baru tidak membawa `spent`.
- Transaksi closed period tidak dapat diedit.
- Koreksi historis dilakukan sebagai adjustment pada open period yang mereferensikan transaksi lama.

### Notifikasi

- Read state disimpan di database per-user.
- Realtime hanya subscribe notification user aktif.
- `dedupe_key` mencegah notifikasi harian ganda.
- Push failure tidak membatalkan transaction database.

### Profil dan preferensi

- Nama/avatar di profile.
- Tema/bahasa/display currency/default wallet per user-workspace.
- FCM/web-push tokens disimpan per device, dapat direvoke saat logout.

---

## 9. RLS dan privilege plan

### 9.1 Helper authorization

Private helper:

```text
private.is_workspace_member(workspace_id)
private.has_workspace_role(workspace_id, allowed_roles[])
private.is_workspace_owner(workspace_id)
```

Helper dapat memakai `SECURITY DEFINER`, wajib:

- berada di schema `private`;
- `set search_path = ''`;
- semua object reference fully qualified;
- tidak menerima user ID dari client; gunakan `auth.uid()`;
- execute privilege direvoke dari `public`/`anon` bila tidak diperlukan.

### 9.2 Policy matrix

| Resource | Viewer | Editor | Owner |
| --- | --- | --- | --- |
| Data finansial | select | select + business RPC | select + business RPC |
| Master data | select | create/update/archive | create/update/archive |
| Workspace settings | select | select | update |
| Membership/invite | lihat seperlunya | lihat seperlunya | manage |
| Audit log | select opsional | select opsional | select |
| Notifications | milik user sendiri | milik user sendiri | milik user sendiri |
| Ledger direct write | tidak | tidak | tidak |
| Critical RPC | tidak | execute | execute |
| Ownership transfer/delete workspace | tidak | tidak | AAL2 owner |

Tabel kritis berikut tidak memberi direct insert/update/delete ke `authenticated`:

- `transactions`;
- `transaction_lines`;
- `command_receipts`;
- `saving_movements`;
- `receivable_payments`;
- closing snapshots;
- `audit_events`.

Direct read tetap memakai RLS membership.

### 9.3 Supabase key

- Publishable/anon key boleh berada di browser.
- Secret/service-role key hanya server/Edge Function.
- Service-role tidak dipakai pada request user biasa.
- Jika server memakai service-role untuk admin job, membership dan input tetap divalidasi eksplisit karena service-role bypass RLS.

### 9.4 MFA

AAL2 diwajibkan untuk:

- transfer ownership;
- menghapus workspace/account;
- mengubah email keamanan;
- export penuh data sensitif;
- mengelola faktor MFA;
- tindakan support/admin berisiko tinggi.

---

## 10. Query, index, dan scale plan

Index minimum:

```text
workspace_members(user_id, workspace_id)
transactions(workspace_id, occurred_at desc, id desc)
transactions(workspace_id, period_id, occurred_at desc)
transactions(workspace_id, type, occurred_at desc)
transactions(workspace_id, category_id, occurred_at desc)
transactions(workspace_id, beneficiary_id, occurred_at desc)
transaction_lines(ledger_account_id, transaction_id)
budgets(period_id, category_id)
saving_movements(saving_id, occurred_at)
receivable_payments(receivable_id, paid_at)
subscriptions(workspace_id, status, next_billing_date)
reminders(workspace_id, status, due_at)
notifications(user_id, read_at, created_at desc)
audit_events(workspace_id, created_at desc)
```

Rules:

- hindari `select *` pada layar yang hanya membutuhkan summary;
- tidak menggunakan unbounded list;
- pagination keyset/cursor, bukan offset, untuk transaksi panjang;
- `EXPLAIN (ANALYZE, BUFFERS)` untuk query laporan utama;
- index kolom yang dipakai helper RLS;
- Realtime subscribe hanya tabel dan filter workspace/user yang diperlukan;
- aggregate mahal dipindahkan ke summary table bila data nyata membuktikan perlu;
- partitioning transaksi belum diperlukan di awal, evaluasi setelah volume per table sangat besar.

---

## 11. Auth dan account lifecycle

### Sign-up

1. User membuat akun Supabase Auth.
2. Email verification.
3. Function bootstrap membuat profile, personal workspace, owner membership, preferences, system ledger accounts, dan initial open period.
4. UI onboarding membuat wallet pertama.

Bootstrap harus idempotent agar retry tidak membuat dua workspace personal.

### Login/session

- Gunakan `@supabase/ssr`.
- Existing Next.js 14 memakai `middleware.ts` untuk refresh cookies; sesuaikan nama menjadi Proxy bila Next.js kelak di-upgrade.
- Proteksi server menggunakan claims/user yang tervalidasi, bukan mempercayai object session mentah.
- Response yang membawa refresh token tidak boleh masuk shared CDN cache.

### Logout

- revoke local session;
- unregister push token device;
- bersihkan query cache dan draft sensitif;
- jangan menampilkan data workspace user sebelumnya.

### Delete account

1. Re-auth/MFA.
2. Tawarkan export.
3. Periksa workspace dengan user sebagai owner terakhir.
4. Transfer ownership atau delete workspace.
5. Tandai deletion request dan retention window.
6. Hapus/anonymize data sesuai policy.
7. Hapus Auth user melalui trusted server.
8. Catat administrative audit tanpa menyimpan data sensitif yang sudah diminta dihapus.

---

## 12. Realtime, PWA, dan offline

Realtime dipakai untuk:

- transaction list terbaru;
- perubahan wallet projection;
- notification;
- perubahan membership.

Realtime tidak menggantikan refetch setelah business RPC. Setelah commit:

1. RPC mengembalikan canonical result;
2. client memperbarui cache;
3. Realtime menjadi sinkronisasi perangkat lain;
4. periodic/refocus refetch memperbaiki event yang terlewat.

Offline policy:

- read terakhir boleh dicache secara lokal;
- form transaksi offline disimpan sebagai encrypted/local draft bila memungkinkan;
- setiap draft memiliki idempotency key;
- status `pending_sync` terlihat jelas;
- balance tidak berubah di UI sebagai posted sebelum server commit;
- konflik ditampilkan ke user, bukan diselesaikan dengan last-write-wins.

---

## 13. Cron, Edge Functions, dan push

Gunakan Database Cron untuk jadwal dan Edge Function hanya saat perlu network call, misalnya Web Push/FCM.

Jobs:

- `generate_subscription_occurrences`;
- `generate_due_notifications`;
- `refresh_exchange_rates`;
- `reconcile_wallet_balances`;
- `reconcile_budget_totals`;
- cleanup expired invitations/tokens;
- cleanup old notification delivery attempts.

Setiap job:

- mempunyai lock agar tidak overlap;
- idempotent;
- mencatat start/end/status/error;
- mempunyai dedupe key;
- tidak menyimpan secret di SQL plaintext; gunakan Vault/secret management.

---

## 14. Testing strategy

### 14.1 Domain unit tests

Wajib mencakup:

- money formatting/conversion;
- period progress;
- safe-to-spend;
- subscription schedules;
- category hierarchy;
- split bill tax/share/settlement;
- empat planning methods;
- credit card semantics;
- reversal behavior.

### 14.2 Database pgTAP tests

Schema:

- semua table penting mempunyai PK/FK/check;
- semua public table mempunyai RLS;
- unique open period;
- unique budget category per period;
- balanced transaction;
- no cross-workspace foreign key;
- no overpayment receivable;
- no oversaving.

RLS:

- anonymous ditolak;
- outsider tidak dapat select;
- viewer read-only;
- editor dapat menjalankan business RPC;
- editor tidak dapat direct write ledger;
- owner dapat manage membership;
- owner tidak dapat menghilangkan owner terakhir;
- user tidak dapat membaca notification user lain;
- service key tidak pernah digunakan di browser test bundle.

RPC:

- retry idempotent;
- payload berbeda dengan key sama ditolak;
- concurrent budget spend tidak kehilangan update;
- concurrent saving reserve tidak melampaui saldo;
- kegagalan tengah proses rollback seluruh write;
- reversal menghasilkan efek finansial kebalikan tepat;
- closed period menolak posting;
- close period atomik.

### 14.3 Integration/E2E

Alur minimum:

1. sign-up → onboarding → wallet opening balance;
2. expense bank → saldo, budget, dashboard, report;
3. income → saldo dan report;
4. transfer dua wallet;
5. credit-card expense dan payment;
6. lent/shared → receivable;
7. partial/full receivable payment;
8. saving reserve/release;
9. split finalization;
10. subscription occurrence/payment;
11. reminder/notification read state;
12. close period dan next period;
13. role viewer/editor/owner;
14. reversal transaction;
15. account export/delete.

### 14.4 Reconciliation tests

Secara periodik buktikan:

```text
wallet.current_balance = balance dari transaction_lines
receivable remaining = original - payments
saving balance = sum movements
budget spent = sum posted allocations
setiap transaction: debit = credit
```

Mismatch harus menjadi alert, bukan diperbaiki diam-diam tanpa audit.

---

## 15. Security, privacy, dan operations

Sebelum public beta:

- RLS aktif dan diuji pada seluruh public table;
- grants direvoke secara default, lalu grant eksplisit;
- function execution direvoke secara default;
- security-definer function diaudit;
- password policy, email verification, CAPTCHA/rate limiting;
- MFA tersedia;
- secret/service-role tidak masuk client bundle;
- Supabase network restrictions sesuai plan yang digunakan;
- private Storage bucket dan signed/authenticated access;
- CSP, secure headers, dependency scanning;
- error tracking tanpa nominal/note sensitif;
- log redaction;
- database backup;
- restore drill;
- billing/compute/storage alerts;
- incident-response runbook;
- data retention, export, dan deletion policy;
- project dev, staging, production terpisah.

Backup:

- production minimal daily backup;
- logical off-site dump terjadwal;
- evaluasi PITR berdasarkan RPO/RTO dan biaya;
- Storage object membutuhkan backup strategy terpisah karena database backup hanya mencakup metadata Storage.

---

## 16. Migration dari aplikasi sekarang

Karena backend sekarang masih in-memory, tidak ada migrasi data production yang kompleks.

### Langkah code migration

1. Tambahkan Supabase CLI dan local stack.
2. Tambahkan `@supabase/supabase-js` dan `@supabase/ssr`.
3. Buat migrations schema, enums, functions, RLS, indexes, dan seed.
4. Generate `database.types.ts`.
5. Buat Supabase browser/server clients dan auth middleware.
6. Implement signup/onboarding/workspace selector.
7. Ganti generic repository dengan query/command ports.
8. Implement wallet + ledger engine.
9. Migrasikan layar transaksi.
10. Migrasikan budget, savings, dan receivable.
11. Migrasikan split, subscriptions, reminder, notification.
12. Migrasikan reports, planning context, dan closing.
13. Migrasikan preferences dari localStorage saat login pertama.
14. Hapus seed runtime dan memory driver setelah parity.
15. Hapus scaffold Firebase setelah cutover tervalidasi.

### Seed

`supabase/seed.sql` menyediakan:

- kategori sistem;
- test users/workspaces untuk local development;
- contoh wallet, transaksi, budget, tabungan, piutang, subscription;
- data edge case credit card, partial receivable, over-budget, dan closed period.

Seed production hanya berisi global categories/system configuration, bukan contoh transaksi pengguna.

---

## 17. Delivery roadmap dan acceptance gate

### Phase 0 — Architecture freeze

Deliverables:

- ADR pilihan Supabase/PostgreSQL;
- glossary finansial;
- posting matrix disetujui;
- definisi period close dan reversal;
- environment strategy.

Gate:

- tidak ada istilah saldo/utang/debit/credit yang ambigu.

### Phase 1 — Supabase foundation

Deliverables:

- Supabase local stack;
- migration workflow;
- CI database reset/lint/pgTAP;
- Auth SSR;
- profiles/workspaces/members/preferences;
- baseline RLS.

Gate:

- user A tidak dapat membaca satu row pun milik user B;
- role matrix lulus automated test.

### Phase 2 — Ledger core

Deliverables:

- wallets;
- ledger accounts;
- transactions/lines;
- posting and reversal RPC;
- idempotency;
- audit;
- balance reconciliation.

Gate:

- seluruh posting matrix lulus;
- concurrent/retry/rollback test lulus;
- tidak ada direct ledger mutation dari browser.

### Phase 3 — Daily finance

Deliverables:

- transaction UI;
- beneficiaries/categories;
- budget/period;
- savings;
- receivables;
- dashboard read model.

Gate:

- seluruh angka dashboard dapat direkonsiliasi ke ledger;
- edit/delete lama sudah berubah menjadi reversal workflow.

### Phase 4 — Extended workflows

Deliverables:

- split bill persisted draft/finalization;
- subscriptions/occurrences;
- reminders/calendar;
- notifications;
- planning;
- reports/export.

Gate:

- parity dengan seluruh fitur aplikasi saat ini;
- tidak ada unbounded collection load.

### Phase 5 — Closing and hardening

Deliverables:

- atomic period closing;
- snapshot;
- Cron/Edge push;
- offline drafts;
- backups/restore drill;
- security review;
- load test;
- observability.

Gate:

- close-period failure injection tidak menghasilkan state parsial;
- restore drill berhasil;
- security checklist selesai.

### Phase 6 — Beta rollout

Urutan:

1. internal test workspace;
2. invited alpha users;
3. read/write monitoring;
4. reconciliation harian;
5. limited public beta;
6. general availability setelah error rate, reconciliation, dan support flow stabil.

Rollback bukan mengembalikan ke memory repository. Rollback berarti menonaktifkan write baru, menjaga database, dan kembali ke versi aplikasi terakhir yang kompatibel.

---

## 18. Definition of Done

Migrasi dianggap selesai hanya jika:

- seluruh fitur membaca dan menulis Supabase;
- tidak ada runtime dependency pada memory/Firebase repository;
- semua financial commands atomik dan idempotent;
- tidak ada direct update/delete pada posted transaction;
- RLS dan role matrix memiliki automated tests;
- seluruh saldo dapat direkonsiliasi dari ledger;
- budget, savings, dan receivables dapat direkonsiliasi;
- period closing atomik;
- query list memakai filter/pagination;
- auth SSR dan logout tidak membocorkan cache user sebelumnya;
- notifications sinkron antarperangkat;
- backup dan restore sudah diuji;
- export dan account deletion tersedia;
- production monitoring dan incident runbook aktif;
- dokumentasi schema dan business rules sesuai implementasi.

---

## 19. Estimasi urutan kerja

Estimasi kasar untuk satu engineer full-stack yang mengerjakan production-grade implementation:

- foundation + Auth/RLS: 1–2 minggu;
- ledger dan financial RPC: 2–3 minggu;
- migrasi daily finance: 2–3 minggu;
- extended workflows/reporting: 2–3 minggu;
- hardening/beta: 1–2 minggu.

Total realistis: sekitar **8–13 minggu**, bergantung pada kedalaman UI auth/collaboration, pengujian, offline drafts, dan push notification. Dua engineer dapat memparalelkan UI/read models setelah ledger contract stabil, tetapi schema/RLS/ledger tetap membutuhkan satu owner teknis agar konsisten.

---

## 20. Referensi implementasi resmi

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase database functions: https://supabase.com/docs/guides/database/functions
- Supabase RPC JavaScript: https://supabase.com/docs/reference/javascript/rpc
- Supabase Next.js SSR client: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase local development/migrations: https://supabase.com/docs/guides/local-development/overview
- Supabase database testing: https://supabase.com/docs/guides/local-development/testing/overview
- Supabase Cron/Edge scheduling: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase Storage RLS: https://supabase.com/docs/guides/storage/security/access-control
- Supabase backups/PITR: https://supabase.com/docs/guides/platform/backups
