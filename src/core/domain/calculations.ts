import { Wallet, Transaction, Budget, BudgetPeriod, Saving } from './types';

export function totalLiquidity(wallets: Wallet[]): number {
  return wallets.reduce((s, w) => s + (w.kind === 'credit' ? -Math.abs(w.balance) : w.balance), 0);
}

// ===== Tabungan (earmark di dalam dompet) =====
const activeSavings = (savings: Saving[]) => savings.filter(s => !s.archived);
/** Total uang yang disisihkan di satu dompet tertentu. */
export function reservedInWallet(walletId: string, savings: Saving[]): number {
  return activeSavings(savings).reduce((s, sv) => s + (sv.walletId === walletId ? sv.balance : 0), 0);
}
/** Total uang yang disisihkan di semua dompet. */
export function totalReserved(savings: Saving[]): number {
  return activeSavings(savings).reduce((s, sv) => s + sv.balance, 0);
}
/** Saldo dompet yang benar-benar bebas dipakai (total − yang dikunci di tabungan). */
export function availableBalance(wallet: Wallet, savings: Saving[]): number {
  return wallet.balance - reservedInWallet(wallet.id, savings);
}
export function balanceDelta(tx: Transaction, walletId: string): number {
  if (tx.type === 'transfer' && tx.walletId === walletId && tx.toWalletId === walletId) return 0;
  if (tx.walletId === walletId) return tx.type === 'income' ? tx.amount : -tx.amount;
  if (tx.type === 'transfer' && tx.toWalletId === walletId) return tx.amount;
  return 0;
}
export function recomputeBalance(opening: number, txs: Transaction[], walletId: string): number {
  return txs.reduce((bal, tx) => bal + balanceDelta(tx, walletId), opening);
}

/**
 * Pelunasan piutang memang menambah saldo, tetapi bukan penghasilan baru: nilai itu
 * sudah pernah tercatat saat uangnya dipinjamkan. Total pemasukan dan proyeksi income
 * harus membedakannya dari gaji, usaha, hadiah, dan sumber penghasilan lainnya.
 */
export function isActualIncome(transaction: Transaction): boolean {
  return !transaction.adjustment
    && transaction.type === 'income'
    && !transaction.settlesReceivableId;
}

export interface BudgetView extends Budget { velocity: number; over: boolean; remaining: number; }
export function budgetView(b: Budget): BudgetView {
  const velocity = b.allocated > 0 ? b.spent / b.allocated : 0;
  return { ...b, velocity, over: b.spent > b.allocated, remaining: b.allocated - b.spent };
}
/** Komitmen anggaran yang belum terealisasi; transaksi yang sudah terjadi ada di saldo. */
export function remainingBudget(budgets: Budget[]): number {
  return budgets.reduce((sum, budget) => sum + Math.max(0, budget.allocated - budget.spent), 0);
}
export function safeToSpend(liquidity: number, budgets: Budget[], reserved = 0): number {
  return liquidity - remainingBudget(budgets) - reserved;
}

const DAY_MS = 86_400_000;
/**
 * Tengah malam lokal dari sebuah tanggal.
 *
 * Wajib sebelum menghitung selisih hari: tanggal periode disimpan terpaku jam 12:00
 * (lihat `toIso` saat periode dibuat), sedangkan `today` membawa jam sekarang. Tanpa
 * dinormalkan, selisihnya mengandung pecahan hari yang berubah-ubah sepanjang hari —
 * itulah yang dulu membuat angka sisa hari bergeser tergantung jam berapa layar dibuka.
 */
const atMidnight = (value: Date | string) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Posisi hari ini di dalam sebuah periode.
 *
 * Hitungannya INKLUSIF di kedua ujung: periode 1–31 Juli berisi 31 hari, dan pada
 * tanggal 31 sisanya adalah 1 hari — bukan 0. Versi sebelumnya mengukur jarak antar
 * ujung (30) sehingga hari terakhir terbaca "0 hari tersisa", dan pembagi "aman
 * dibelanjakan per hari" harus diselamatkan dengan Math.max(1, …) di setiap pemakainya.
 *
 * `daysLeft` sengaja TIDAK dijepit di 0: nilai nol/negatif adalah satu-satunya cara
 * memberi tahu bahwa periode sudah lewat tanggal tapi belum ditutup. Pemakai yang hanya
 * ingin menampilkan angka wajib menjepitnya sendiri; yang memakainya sebagai pembagi
 * tetap perlu Math.max(1, …).
 */
export function periodProgress(p: BudgetPeriod, today: Date = new Date()) {
  const start = atMidnight(p.start);
  const end = atMidnight(p.end);
  const now = atMidnight(today);
  const totalDays = Math.max(1, Math.round((+end - +start) / DAY_MS) + 1);
  // Berapa hari sudah berlalu sejak hari pertama; 0 pada hari mulai, negatif sebelumnya.
  const elapsed = Math.round((+now - +start) / DAY_MS);
  return {
    /** Hari ke berapa, 1-based. 0 selama periode belum dimulai. */
    dayOf: elapsed < 0 ? 0 : Math.min(totalDays, elapsed + 1),
    totalDays,
    /**
     * Sisa hari termasuk hari ini. 1 = hari terakhir, ≤0 = sudah lewat tanggal.
     * Dibatasi di atas oleh panjang periode: periode yang belum mulai tidak boleh
     * mengaku bersisa lebih lama daripada durasinya sendiri.
     */
    daysLeft: Math.min(totalDays, totalDays - elapsed),
    fraction: Math.min(1, Math.max(0, (elapsed + 1) / totalDays)),
    notStarted: elapsed < 0,
    overdue: totalDays - elapsed <= 0,
  };
}
export function periodNet(liquidity: number, budgets: Budget[]): number {
  return safeToSpend(liquidity, budgets);
}
