// ===== Domain types (framework-agnostic) =====
// `kind` menentukan perlakuan akuntansi (aset vs liabilitas), `medium` menentukan
// bentuk fisiknya — dipakai untuk memilih field yang relevan (no. rekening vs no. HP).
export type WalletKind = 'debit' | 'credit';
export type WalletMedium = 'bank' | 'ewallet' | 'cash' | 'credit';
export type CardNetwork = 'visa' | 'mastercard' | 'gpn';
export type TxType = 'expense' | 'income' | 'transfer';
export type TxNature = 'fixed' | 'unexpected';
export type TransactionBenefitScope = 'self' | 'shared' | 'other';
export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type SubStatus = 'active' | 'paused' | 'cancelled' | 'ended';
export type PlanStatus = 'draft' | 'active' | 'done';
export type ReceivableStatus = 'open' | 'partial' | 'settled' | 'written_off';

export interface Wallet {
  id: string; name: string; kind: WalletKind; medium?: WalletMedium; bank?: string;
  last4?: string;            // display only; full PAN encrypted server-side (arch §4.1)
  phone?: string;            // e-wallet: identitas akun bukan no. rekening tapi no. HP
  cardNetwork?: CardNetwork;
  balance: number;           // cached, maintained incrementally
  creditLimit?: number;
}
export interface Transaction {
  id: string; type: TxType; nature: TxNature; amount: number;
  benefitScope?: TransactionBenefitScope;
  walletId: string; toWalletId?: string; labels: string[];
  merchant?: string;            // tempat transaksi: Indomaret, Shopee, kaki lima, …
  budgetId?: string;            // realisasi expense/transfer biasa; bukan pembayaran kartu
  installmentTenorMonths?: number; // transaksi kartu kredit dicicil selama N bulan
  installmentPaidMonths?: number;  // jumlah angsuran lunas saat ini (termasuk pembayaran yang dialokasikan)
  installmentInitialPaidMonths?: number; // baseline sebelum transaksi dicatat di aplikasi
  creditPaymentInstallments?: Array<{
    installmentTransactionId: string;
    installmentsPaid: number;
  }>;
  savingId?: string;            // transfer ini sekaligus menyisihkan dana ke tabungan
  settlesReceivableId?: string; // pemasukan ini adalah pelunasan piutang tertentu
  // Transaksi yang lahir dari perubahan saldo manual / penghapusan dompet, bukan
  // dari belanja nyata. Ditandai agar bisa dikecualikan dari analisa perilaku.
  adjustment?: boolean;
  adjustmentReason?: string;
  note?: string; recipient?: string; isReceivable?: boolean;
  owedAmount?: number;          // nominal transaksi yang menjadi piutang
  subscriptionId?: string; date: string;
}
// `periodId` menempelkan anggaran pada satu periode — dipakai laporan periode agar
// anggaran periode lama tidak tercampur dengan yang berjalan.
export interface Budget { id: string; category: string; allocated: number; spent: number; periodId?: string; }
export interface BudgetPeriod {
  id: string;
  alias: string;
  start: string;
  end: string;
  closed: boolean;
  status?: 'draft' | 'open' | 'closed';
}
export interface Subscription {
  id: string; name: string; amount: number; walletId: string; category: string;
  cycle: BillingCycle; customIntervalDays?: number; startDate: string;
  endDate?: string | null; nextBillingDate: string; reminderDaysBefore: number; status: SubStatus;
}
export interface Receivable {
  id: string; person: string; amount: number; source: string; date: string; settled: boolean;
  status?: ReceivableStatus;
  paid?: number;            // akumulasi pembayaran; lunas saat paid >= amount
  settledAt?: string;       // kapan dilunasi
  settledByTxId?: string;   // transaksi pemasukan yang melunasinya
}
// Tabungan (sinking fund): uang nyata yang DISISIHKAN di dalam sebuah dompet debit.
// Uangnya tetap berada di wallet `walletId` (saldo dompet tak berubah), tapi `balance`
// di sini "dikunci" — dikurangi dari saldo tersedia & tidak dihitung sebagai safe-to-spend.
export interface Saving {
  id: string; name: string; walletId: string; balance: number;
  ownership: 'self' | 'other';
  target?: number; targetDate?: string; emoji?: string; archived?: boolean;
}
export interface Plan { id: string; title: string; target: number; saved: number; targetDate?: string; status: PlanStatus; }
// Pengingat / to-do berbasis tanggal yang tampil di kalender bersama jatuh tempo langganan.
export interface Reminder {
  id: string; title: string; date: string; note?: string; done: boolean;
  amount?: number;            // opsional: kalau pengingatnya soal bayar sesuatu
}
