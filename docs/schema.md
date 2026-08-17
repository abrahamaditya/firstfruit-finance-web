# Skema Data — FirstFruit Finance

Skema PostgreSQL kanonis ada di
[`supabase/migrations`](../supabase/migrations). Dokumen ini menjelaskan projection model
yang dipakai UI; nama field camelCase dipetakan oleh repository Supabase ke tabel/view SQL.

Semua koleksi memakai kontrak CRUD yang sama (`src/core/ports/repositories.ts`):
`list()`, `get(id)`, `create(item)`, `update(id, patch)`, `remove(id)`.

Konvensi:

- `amount` / `balance` / `allocated` / `spent` = **integer Rupiah**.
- Field bertanda `?` opsional. Repository memetakannya menjadi `null` bila relevan.
- Tanggal = **ISO 8601 string** (`2026-07-26T05:00:00.000Z`).

---

## Peta relasi

```
Wallet ──< Transaction >── Budget
  │            │  └─────── Receivable   (settlesReceivableId)
  │            └────────── Wallet       (toWalletId, khusus transfer)
  └──< Saving

Subscription ──> Wallet        (walletId, dompet pembayaran)
Reminder      (berdiri sendiri, tampil di kalender)
BudgetPeriod  (berdiri sendiri, menentukan rentang anggaran & laporan)
Plan          (berdiri sendiri, sandbox rencana)
```

---

## Wallet — koleksi `wallets`

| Field | Tipe | Wajib | Keterangan |
| --- | --- | :-: | --- |
| `id` | string | ✔ | |
| `name` | string | ✔ | Nama tampilan yang diturunkan dari produk terpilih, mis. "Debit BCA". |
| `kind` | `debit` \| `credit` | ✔ | Klasifikasi akuntansi: aset vs liabilitas. |
| `medium` | `bank` \| `credit` \| `ewallet` \| `cash` | | Bentuk fisik; menentukan field mana yang relevan. |
| `bank` | string | | Produk bank/penerbit/e-wallet yang dipilih dari katalog sesuai `medium`; menjadi sumber identitas merek dan logo. |
| `last4` | string | | 4 digit terakhir (bank & kartu kredit). **Nomor penuh tidak disimpan di klien.** |
| `phone` | string | | Nomor HP pemilik akun e-wallet. |
| `balance` | number | ✔ | Untuk `credit`, ini besar tagihan (positif = utang). |
| `creditLimit` | number | | Hanya kartu kredit. |

---

## Transaction — koleksi `transactions`

| Field | Tipe | Wajib | Keterangan |
| --- | --- | :-: | --- |
| `id` | string | ✔ | |
| `type` | `expense` \| `income` \| `transfer` | ✔ | |
| `nature` | `fixed` \| `unexpected` | ✔ | Pengeluaran: terencana/tak terduga. Pemasukan: rutin/tidak rutin. |
| `amount` | number | ✔ | Selalu positif; arah ditentukan `type`. |
| `walletId` | string → Wallet | ✔ | Sumber dana (transfer: dompet asal). |
| `toWalletId` | string → Wallet | | Hanya transfer. |
| `labels` | string[] | ✔ | `labels[0]` = kategori terdalam yang dipilih. Kosong untuk transfer. |
| `merchant` | string | | Tempat transaksi (bebas, ada daftar saran). |
| `budgetId` | string → Budget | | Pos anggaran yang direalisasikan oleh pengeluaran atau transfer biasa; pembayaran kartu dikecualikan. |
| `installmentTenorMonths` | number | | Tenor 2–120 bulan; hanya untuk pengeluaran dari kartu kredit. |
| `settlesReceivableId` | string → Receivable | | Pemasukan ini melunasi piutang tersebut. |
| `recipient` | string | | Nama pengutang pada transaksi Piutang. |
| `isReceivable` | boolean | | Penanda bahwa transaksi ini melahirkan piutang. |
| `owedAmount` | number | | Porsi yang ditagih balik. |
| `subscriptionId` | string → Subscription | | Bila transaksi lahir dari langganan. |
| `adjustment` | boolean | | `true` untuk transaksi hasil penyesuaian saldo / penghapusan dompet. |
| `adjustmentReason` | string | | Penjelasan singkat, mis. "Rp 1.000.000 → Rp 900.000". |
| `date` | ISO string | ✔ | |

Definisi angka pemasukan di seluruh UI:

- **Pemasukan** menghitung semua transaksi `income`, termasuk pelunasan piutang. Pada
  ringkasan satu dompet, transfer yang diterima juga termasuk arus masuk dompet tersebut.
- **Pemasukan riil** hanya menghitung `income` tanpa `adjustment` dan tanpa
  `settlesReceivableId`. Transfer tidak pernah menjadi pemasukan riil.
- Arus kas bersih, rasio menabung, proyeksi pemasukan, dan kapasitas rencana memakai
  pemasukan riil agar pengembalian aset atau perpindahan saldo tidak dianggap pendapatan baru.

> Indeks PostgreSQL, composite foreign key, ledger, dan aturan immutability didefinisikan
> pada versioned migrations, bukan di client.

---

## Budget — koleksi `budgets`

| Field | Tipe | Wajib | Keterangan |
| --- | --- | :-: | --- |
| `id` | string | ✔ | |
| `category` | string | ✔ | Biasanya kategori tingkat 2 dari taksonomi. |
| `allocated` | number | ✔ | Pagu periode berjalan. |
| `spent` | number | ✔ | Realisasi; bertambah otomatis dari transaksi yang memilih anggaran ini. |

Turunan (dihitung, tidak disimpan): `velocity`, `over`, `remaining` — lihat `budgetView`.

---

## BudgetPeriod — koleksi `periods`

| Field | Tipe | Wajib | Keterangan |
| --- | --- | :-: | --- |
| `id` | string | ✔ | |
| `alias` | string | ✔ | Nama tampilan, mis. "Periode Agustus 2026". |
| `start` / `end` | ISO string | ✔ | Rentang inklusif. |
| `closed` | boolean | ✔ | Hanya satu periode terbuka yang dianggap aktif. |

---

## Subscription — koleksi `subscriptions`

| Field | Tipe | Wajib | Keterangan |
| --- | --- | :-: | --- |
| `id` | string | ✔ | |
| `name` | string | ✔ | |
| `amount` | number | ✔ | Nominal per tagihan. |
| `walletId` | string → Wallet | ✔ | Dompet pembayaran. |
| `category` | string | ✔ | Kategori dari taksonomi yang sama. |
| `cycle` | `weekly` \| `monthly` \| `quarterly` \| `yearly` \| `custom` | ✔ | |
| `customIntervalDays` | number | | Hanya untuk `custom`. |
| `startDate` | ISO string | ✔ | Batas mundur saat menghitung tanggal tagihan historis. |
| `endDate` | ISO string \| null | | Kapan layanan berakhir. |
| `nextBillingDate` | ISO string | ✔ | Titik acuan perhitungan siklus. |
| `reminderDaysBefore` | number | ✔ | Ambang notifikasi "akan ditagih". |
| `status` | `active` \| `paused` \| `cancelled` \| `ended` | ✔ | Hanya `active` yang dihitung & dinotifikasi. |

---

## Receivable — koleksi `receivables`

| Field | Tipe | Wajib | Keterangan |
| --- | --- | :-: | --- |
| `id` | string | ✔ | |
| `person` | string | ✔ | Nama penanggung utang. |
| `amount` | number | ✔ | Nominal awal. |
| `source` | string | ✔ | Asal piutang (split bill, talangan, pinjaman). |
| `date` | ISO string | ✔ | |
| `settled` | boolean | ✔ | |
| `paid` | number | | Akumulasi pembayaran; lunas saat `paid ≥ amount`. |
| `settledAt` | ISO string | | |
| `settledByTxId` | string → Transaction | | Transaksi pemasukan yang melunasinya. |

---

## Saving — koleksi `savings`

| Field | Tipe | Wajib | Keterangan |
| --- | --- | :-: | --- |
| `id` | string | ✔ | |
| `name` | string | ✔ | |
| `walletId` | string → Wallet | ✔ | Dompet **debit** tempat uangnya berada secara fisik. |
| `balance` | number | ✔ | Jumlah yang dikunci; dikurangkan dari saldo tersedia dompet itu. |
| `target` / `targetDate` | number / ISO string | | Opsional. |
| `emoji` | string | | Ikon tampilan. |
| `archived` | boolean | | Tabungan arsip tidak dihitung. |

---

## Reminder — koleksi `reminders`

| Field | Tipe | Wajib | Keterangan |
| --- | --- | :-: | --- |
| `id` | string | ✔ | |
| `title` | string | ✔ | |
| `date` | ISO string | ✔ | Tanggal tampil di kalender. |
| `amount` | number | | Bila ada, ikut dihitung sebagai tagihan bulan depan di rencana keuangan. |
| `note` | string | | |
| `done` | boolean | ✔ | |

---

## Plan — koleksi `plans`

| Field | Tipe | Wajib | Keterangan |
| --- | --- | :-: | --- |
| `id` | string | ✔ | |
| `title` | string | ✔ | |
| `target` / `saved` | number | ✔ | Sandbox; tidak memengaruhi saldo nyata. |
| `targetDate` | ISO string | | |
| `status` | `draft` \| `active` \| `done` | ✔ | |

---

## Data pendukung

| Data | Lokasi | Keterangan |
| --- | --- | --- |
| Preferensi pengguna | `user_workspace_preferences` + `profiles` | tema, bahasa, mata uang, notifikasi, nama, `defaultWalletId`, dan urutan dompet; tema saja dicache lokal untuk mencegah flash. |
| Kurs USD↔IDR | `localStorage` → `abraham.fx` | hasil cache API kurs harian. |
| Status baca notifikasi | `notifications.read_at` | persisten per user dan tersinkron realtime. |
| Split bill | `split_bills` dan child tables | peserta, nota, item, share, settlement, dan piutang hasil finalisasi. |

---

## Projection compatibility

Semua field baru bersifat opsional, jadi data lama tetap terbaca:

| Perubahan | Perilaku untuk data lama |
| --- | --- |
| `Wallet.medium`, `Wallet.phone` | Tanpa `medium` → diturunkan dari `kind`. |
| `Transaction.merchant`, `budgetId`, `adjustment` | Kosong = perilaku lama. |
| `Receivable.paid`, `settledAt`, `settledByTxId` | `paid` kosong dianggap 0. |
| Taksonomi kategori 3 tingkat | Label lama yang tidak dikenal tetap valid sebagai kategori bebas satu tingkat. |
| `Preferences.defaultWalletId` | Kosong = tidak ada dompet default; fallback memakai dompet debit pertama. |
