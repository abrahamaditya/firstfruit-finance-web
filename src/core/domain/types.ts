// ===== Domain types (framework-agnostic) =====
// `kind` menentukan perlakuan akuntansi (aset vs liabilitas), `medium` menentukan
// bentuk fisiknya — dipakai untuk memilih field yang relevan (no. rekening vs no. HP).
export type WalletKind = 'debit' | 'credit';
export type WalletMedium = 'bank' | 'ewallet' | 'cash' | 'credit';
export type TxType = 'expense' | 'income' | 'transfer';
export type TxNature = 'fixed' | 'unexpected';
// Untuk siapa pengeluaran ini: diri sendiri, memberi (hadiah, tak kembali),
// ditalangin (piutang penuh), atau patungan (piutang sebagian).
export type TxBeneficiary = 'self' | 'gift' | 'lent' | 'shared';
export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type SubStatus = 'active' | 'paused' | 'cancelled' | 'ended';
export type PlanStatus = 'draft' | 'active' | 'done';

export interface Wallet {
  id: string; name: string; kind: WalletKind; medium?: WalletMedium; bank?: string;
  last4?: string;            // display only; full PAN encrypted server-side (arch §4.1)
  phone?: string;            // e-wallet: identitas akun bukan no. rekening tapi no. HP
  balance: number;           // cached, maintained incrementally
  creditLimit?: number;
}
export interface Transaction {
  id: string; type: TxType; nature: TxNature; amount: number;
  walletId: string; toWalletId?: string; labels: string[];
  merchant?: string;            // tempat transaksi: Indomaret, Shopee, kaki lima, …
  budgetId?: string;            // anggaran yang dibebani pengeluaran ini
  settlesReceivableId?: string; // pemasukan ini adalah pelunasan piutang tertentu
  beneficiaryId?: string;       // pihak terkait dari daftar penerima
  // Transaksi yang lahir dari perubahan saldo manual / penghapusan dompet, bukan
  // dari belanja nyata. Ditandai agar bisa dikecualikan dari analisa perilaku.
  adjustment?: boolean;
  adjustmentReason?: string;
  note?: string; recipient?: string; isReceivable?: boolean;
  beneficiary?: TxBeneficiary;  // default 'self'; menentukan apakah jadi piutang
  owedAmount?: number;          // porsi yang ditagih balik (lent = penuh, shared = sebagian)
  subscriptionId?: string; date: string;
}
export interface Budget { id: string; category: string; allocated: number; spent: number; }
export interface BudgetPeriod { id: string; alias: string; start: string; end: string; closed: boolean; }
export interface Subscription {
  id: string; name: string; amount: number; walletId: string; category: string;
  cycle: BillingCycle; customIntervalDays?: number; startDate: string;
  endDate?: string | null; nextBillingDate: string; reminderDaysBefore: number; status: SubStatus;
}
export interface Receivable {
  id: string; person: string; amount: number; source: string; date: string; settled: boolean;
  paid?: number;            // akumulasi pembayaran; lunas saat paid >= amount
  settledAt?: string;       // kapan dilunasi
  settledByTxId?: string;   // transaksi pemasukan yang melunasinya
}
// Tabungan (sinking fund): uang nyata yang DISISIHKAN di dalam sebuah dompet debit.
// Uangnya tetap berada di wallet `walletId` (saldo dompet tak berubah), tapi `balance`
// di sini "dikunci" — dikurangi dari saldo tersedia & tidak dihitung sebagai safe-to-spend.
export interface Saving {
  id: string; name: string; walletId: string; balance: number;
  target?: number; targetDate?: string; emoji?: string; archived?: boolean;
}
export interface Plan { id: string; title: string; target: number; saved: number; targetDate?: string; status: PlanStatus; }
// Pihak yang berhubungan dengan transaksi: lembaga (gereja, yayasan), kelompok
// (keluarga), atau orang tertentu. Dipakai ulang agar penamaannya konsisten.
export type BeneficiaryKind = 'person' | 'family' | 'organization' | 'church' | 'business';
export interface Beneficiary {
  id: string; name: string; kind: BeneficiaryKind; note?: string; archived?: boolean;
}

// Pengingat / to-do berbasis tanggal yang tampil di kalender bersama jatuh tempo langganan.
export interface Reminder {
  id: string; title: string; date: string; note?: string; done: boolean;
  amount?: number;            // opsional: kalau pengingatnya soal bayar sesuatu
}
