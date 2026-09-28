# Skema Domain — FirstFruit Finance

Dokumen ini memetakan **model yang dipakai aplikasi** ke tabel, view, dan RPC Supabase.
Definisi TypeScript ada di [`src/core/domain/types.ts`](../src/core/domain/types.ts),
pemetaan runtime di [`repositories.ts`](../src/infrastructure/supabase/repositories.ts),
dan tipe skema `public` hasil generate di
[`database.types.ts`](../src/infrastructure/supabase/database.types.ts). Untuk aturan
perhitungannya, lihat [Aturan bisnis](business-logic.md).

Dokumen ini bukan pengganti DDL. Migrasi dan skema database tertaut menentukan
constraint, indeks, RLS, dan bentuk RPC sebenarnya. **Snapshot Git saat ini belum
melacak seluruh migrasi awal**, sehingga checkout bersih belum dapat membangun database
baru hanya dari direktori `supabase/migrations` yang terlacak. Lihat [README](../README.md)
sebelum menjalankan perintah migrasi.

## Konvensi pemetaan

- Seluruh nominal domain (`amount`, `balance`, `spent`, dan lain-lain) adalah `number`
  **integer Rupiah**. Kolom SQL `*_minor` berisi integer Rupiah, bukan pecahan sen.
- ID relasi berbentuk string/UUID. `workspace_id` adalah batas tenant; foreign key
  komposit dan RLS ditegakkan oleh database.
- Tanggal transaksi di domain berupa ISO string; kolom tanggal saja seperti
  `start_date`/`end_date` diproyeksikan ke ISO untuk aplikasi. Rentang periode inklusif.
- Field opsional domain (`?`) dapat berasal dari SQL `NULL`, kolom legacy, atau nilai
  turunan. **Jangan** menganggap setiap field domain adalah satu kolom pada tabel.
- Repository generik menyediakan `list`, `get`, `create`, `update`, dan `remove`, tetapi
  operasi finansialnya memakai RPC; `update`/`remove` transaksi bukan SQL `UPDATE`/
  `DELETE` langsung pada jurnal. `installments` hanya menyediakan `list`.
- Pada pembacaan, `Transaction.labels` adalah jalur kategori yang dibentuk dari nama
  kategori (`categoryPath`). Form mengirim satu kategori terpilih. Karena itu
  `labels[0]` pada objek hasil baca bisa berarti **kelompok induk**, bukan selalu
  label paling spesifik.

## Peta entitas

| Model aplikasi | Sumber utama | Hubungan penting |
| --- | --- | --- |
| `Wallet` | `wallets` | Milik workspace; sumber/tujuan transaksi dan tempat fisik tabungan. |
| `Transaction` | `v_transactions` di atas `transactions` dan tabel terkait | Terikat ke periode, dompet, kategori, anggaran opsional, cicilan, dan piutang. |
| `Budget` | `v_budget_progress` di atas `budgets` + alokasi transaksi | Selalu terkait satu periode; `spent` adalah read model. |
| `BudgetPeriod` | `budget_periods` | Menaungi transaksi dan anggaran; status `draft`, `open`, atau `closed`. |
| `Subscription` | `subscriptions` | Jadwal tagihan; tidak otomatis membuat transaksi. |
| `Saving` | `savings_goals` | Mengunci sebagian saldo sebuah dompet debit. |
| `Receivable` | `receivables` | Pelunasan dapat ditautkan ke transaksi pemasukan. |
| `Plan`, `Reminder` | `plans`, `reminders` | Perencanaan dan kalender, terpisah dari ledger. |

Posting transaksi juga melibatkan `ledger_accounts`, `journal_entries`,
`journal_postings`, `transaction_lines`, `transaction_budget_allocations`, dan
`command_receipts`. Operasi split bill memakai tabel split dan nota/item/share
tersendiri. Aplikasi tidak menulis tabel ledger itu satu per satu dari browser.

## Dompet (`Wallet`)

| Field domain | Tipe | Sumber / arti |
| --- | --- | --- |
| `id`, `name` | string | `wallets.id`, `name`. |
| `kind` | `debit` \| `credit` | Diturunkan dari `wallet_class`: aset vs liabilitas. |
| `medium?` | `bank` \| `ewallet` \| `cash` \| `credit` | `medium`, bentuk dompet pada UI. |
| `bank?`, `last4?`, `phone?`, `cardNetwork?` | string / enum | Institusi/produk, identitas masked, dan jaringan kartu. |
| `balance` | integer IDR | `current_balance_minor`, saldo tersimpan. Pada kartu, positif berarti tagihan. |
| `creditLimit?` | integer IDR | `credit_limit_minor`; hanya relevan untuk kartu kredit. |
| `previousPeriodBill?` | integer IDR | `previous_period_bill_minor`, baseline tagihan periode sebelumnya. |

`balance` kartu **bukan** satu-satunya sumber “sisa limit” di UI. Perhitungan
`creditLimitBreakdown` menggabungkannya dengan semua cicilan belum lunas lintas periode
dan rekonsiliasi angsuran yang sudah masuk ledger. `availableBalance` dompet debit
dikurangi tabungan aktif yang menempati dompet itu.

## Transaksi (`Transaction`)

| Field domain | Tipe | Sumber / arti |
| --- | --- | --- |
| `id`, `date`, `periodId?` | string | `transactions.id`, `occurred_at`, `period_id`. |
| `type` | `expense` \| `income` \| `transfer` | Jenis UI. SQL juga memiliki `credit_payment` dan `adjustment`; repository memetakannya ke jenis UI yang sesuai. |
| `nature` | `fixed` \| `unexpected` | Normalisasi dari `transaction_nature` SQL. |
| `amount` | integer IDR | `amount_minor`; selalu nominal positif, arah ditentukan jenis. |
| `walletId`, `toWalletId?` | string | Dompet sumber dan tujuan opsional. |
| `labels` | string[] | Jalur kategori hasil pembacaan `category_name`; kosong untuk transfer biasa. |
| `merchant?`, `note?` | string | Tempat dan catatan. |
| `budgetId?` | string | Hubungan eksplisit ke anggaran melalui alokasi transaksi. Pembayaran kartu tidak memakai anggaran. |
| `benefitScope?` | `self` \| `shared` \| `other` | Pemanfaatan pengeluaran; Giving diperlakukan sebagai `other` pada alur UI. |
| `owedAmount?`, `recipient?`, `isReceivable?` | integer / string / boolean | Porsi piutang, nama pihak, dan indikator turunan; `isReceivable` bukan kolom tersendiri. |
| `settlesReceivableId?` | string | Pelunasan piutang oleh pemasukan ini. |
| `savingId?`, `subscriptionId?` | string | Relasi opsional. Adanya `subscriptionId` tidak berarti form langganan memposting transaksi. |
| `adjustment?`, `adjustmentReason?` | boolean / string | Penyesuaian saldo yang dibedakan dari pemasukan/pengeluaran riil. |

Repository membaca `v_transactions`, dan `transactions.list()` melakukan pagination
agar riwayat lintas periode tidak berhenti pada 500 baris pertama. `transactions.get()`
juga mengambil alokasi cicilan untuk pembayaran kartu bila diperlukan. Koreksi transaksi
umum memakai RPC pengganti/reversal, sedangkan alokasi pembayaran kartu dan metadata
harga cicilan mempunyai RPC pembaruan khusus.

### Rincian cicilan pada transaksi kartu

Satu transaksi pengeluaran kartu dapat memiliki satu baris `transaction_installments`.
View `v_transactions` mengeksposnya sebagai field berikut:

| Field domain | Kolom / aturan |
| --- | --- |
| `installmentTenorMonths?` | `tenor_months`; 2–120 bulan. |
| `installmentInitialPaidMonths?` | `completed_installments` sebagai baseline saat dicatat. |
| `installmentPaidMonths?` | Baseline + pembayaran kartu yang sudah dialokasikan, dihitung dalam view. |
| `installmentItemTotal?` | `item_total_minor`, harga pokok barang tanpa bunga. |
| `installmentInterestTotal?` | `interest_total_minor`, **total** bunga seluruh tenor. |
| `installmentPricingMode?` | `pricing_mode`: `monthly` atau `item_total`. |

`Transaction.amount` untuk cicilan adalah nominal angsuran yang dicatat ketika
transaksi diposting, **bukan** seluruh biaya tenor. `installmentTotalPayable` memakai
`itemTotal + interestTotal` bila rincian tersedia; untuk record lama tanpa rincian,
perkiraannya `amount × tenor`. `installmentPaymentAmount` membagikan pembulatan Rp1 ke
angsuran terawal, sehingga jumlah angsuran tepat sama dengan total bayar.

Alokasi pembayaran berada di `credit_payment_installment_allocations`, menghubungkan
`payment_transaction_id` dan `installment_transaction_id`, dengan
`installments_paid` dan `amount_minor`. Di domain, pilihan form disajikan sebagai
`creditPaymentInstallments[]` berisi ID cicilan dan jumlah angsuran yang dibayar.
Jumlah yang tidak dialokasikan tetap membayar tagihan kartu tanpa menambah progres
cicilan. Baris cicilan lama boleh memiliki `item_total_minor`, `interest_total_minor`,
dan `pricing_mode` bernilai `NULL`; itu menandai rincian yang memang belum diketahui.

## Anggaran dan periode

| Model / field | Sumber / aturan |
| --- | --- |
| `Budget.id`, `category`, `periodId` | `budgets.id`, nama kategori pada `v_budget_progress`, dan `period_id`. |
| `Budget.allocated` | `allocated_minor`, pagu yang dimasukkan pengguna. |
| `Budget.spent` | `spent_minor` pada `v_budget_progress`, dari alokasi transaksi posted. |
| `BudgetView.remaining`, `over`, `velocity` | Dihitung di `budgetView`, tidak disimpan sebagai field domain utama. |
| `BudgetPeriod.alias`, `start`, `end` | `budget_periods.alias`, `start_date`, `end_date`. |
| `BudgetPeriod.status?` | `draft` \| `open` \| `closed` dari kolom status. |
| `BudgetPeriod.closed` | Proyeksi kompatibilitas dari status; gunakan `status` untuk membedakan draft dari closed. |

Periode aktif dipilih dari status `open`. Anggaran lama tetap terikat ke `periodId`-nya
ketika periode baru dibuat; menyalin struktur tidak menyalin realisasi. **Anggaran
cicilan otomatis** pada layar Anggaran diturunkan dari jadwal cicilan (`installmentDuesForPeriod`),
bukan baris `Budget` baru. Layar Anggaran menambahkannya ke total periode yang dilihat;
bagian Laporan “Realisasi anggaran” dan proyeksi saat ini memakai baris `Budget` manual
periode aktif saja. Perbedaan cakupan ini penting saat membandingkan kedua layar.

## Langganan (`Subscription`)

| Field domain | Tipe | Sumber / arti |
| --- | --- | --- |
| `id`, `name`, `amount` | string / integer | `subscriptions.id`, `name`, `amount_minor` per tagihan. |
| `cycle`, `customIntervalDays?` | enum / number | Siklus mingguan, bulanan, kuartalan, tahunan; `custom` tetap didukung domain untuk data lama. |
| `startDate`, `nextBillingDate` | ISO string | `start_date` dan `next_billing_date` sebagai acuan jadwal. |
| `endDate?` | ISO string \| `null` | `end_date = NULL` berarti tidak ada tanggal akhir yang diketahui. |
| `reminderDaysBefore`, `status` | number / enum | Ambang pengingat; `active`, `paused`, `cancelled`, `ended`. |
| `walletId?`, `category?` | string | Field kompatibilitas dari model lama; form dan repository saat ini tidak mengisinya. |

SQL masih dapat memiliki `wallet_id`, `category_id`, dan `subscription_occurrences`
untuk data/relasi lama. Menambah langganan melalui UI sekarang hanya menyimpan jadwal
dan nominal, **tidak** membuat transaksi, memilih dompet, atau mengurangi saldo.
Pembayaran dicatat secara eksplisit di menu Transaksi.

## Tabungan, piutang, dan model lain

| Model | Field pokok | Aturan pemetaan |
| --- | --- | --- |
| `Saving` | `id`, `name`, `walletId`, `balance`, `ownership`, `target?`, `targetDate?`, `emoji?`, `archived?` | `savings_goals.current_balance_minor` adalah dana yang disisihkan dalam wallet debit; `ownership` = `self`/`other`. |
| `Receivable` | `person`, `amount`, `paid?`, `status?`, `settled`, `settledAt?`, `settledByTxId?` | `amount` adalah nominal **awal**, `paid` akumulasi pembayaran, `status` mencakup `written_off`. |
| `Plan` | `title`, `target`, `saved`, `targetDate?`, `status?` | Nilai target/tersimpan berasal dari input rencana; simulasi tidak mengubah saldo atau ledger. |
| `Reminder` | `title`, `date`, `amount?`, `note?`, `done` | `due_at`, nominal opsional, dan status selesai untuk kalender. |

`profiles` dan `user_workspace_preferences` menyimpan identitas, tampilan, notifikasi,
dompet default, dan urutan dompet. `categories` menyimpan taksonomi sistem dan kategori
workspace. `notifications.read_at` mencatat status baca per user/workspace. Split bill
memiliki tabel peserta/nota/item/share/settlement sendiri; ia bukan array transaksi
yang disimpan langsung dalam `Transaction`.

## Read model laporan yang tidak disimpan sebagai kolom

- `creditLimitBreakdown`: limit terpakai = saldo kartu setelah bagian cicilan yang sudah
  tercatat direkonsiliasi + seluruh sisa cicilan, dijepit minimal nol. Sisa limit juga
  dijepit minimal nol. **Tidak** dibatasi oleh `BudgetPeriod` yang sedang dibuka.
- `forecastBudgetRealization`: estimasi realisasi anggaran manual periode aktif dengan
  pola hingga tiga periode tertutup per kategori; alokasi menjadi fallback bila riwayat
  tidak ada. Hasilnya bukan record transaksi atau field pada tabel `budgets`.
- `periodPatterns`: agregasi hingga delapan periode `closed`, meliputi pemasukan dan
  pengeluaran riil, arus kas bersih, anggaran, serta kelompok kategori. Pembagi metrik
  per hari adalah seluruh hari kalender periode.

Semua perhitungan ini dijalankan saat membaca data. Skema tidak menyimpan nilai
proyeksi atau “pola” sebagai kolom yang harus dimigrasikan.

## Kompatibilitas dan batas data lama

- `Transaction` cicilan lama tanpa harga barang/bunga memakai perkiraan nominal bulanan
  × tenor; UI menandainya sebagai estimasi dan menawarkan pelengkapan rincian.
- Field opsional seperti `periodId`, `medium`, dan metadata piutang dapat kosong pada
  record lama. Repository dan fungsi domain mempunyai fallback; fallback bukan alasan
  untuk menulis nilai historis rekaan ke database.
- `Subscription.walletId`/`category` dapat ada secara historis, tetapi tidak menjadi
  syarat jadwal saat ini.
- `useReceivables().total` sekarang menjumlahkan nominal **awal** piutang aktif,
  bukan sisa setelah pembayaran. Lihat catatan di [Aturan bisnis](business-logic.md)
  sebelum memakai nilai itu sebagai jumlah piutang yang masih dapat ditagih.
