import type { BudgetPeriod, Transaction, Wallet } from './types';
import { addDays, dayKey } from './calendar';
import { installmentSchedule } from './installment-schedule';

type PeriodRange = Pick<BudgetPeriod, 'start' | 'end'>;

/**
 * Posisi satu kartu kredit pada periode acuan. Semua layar membaca angka kartu dari
 * sini supaya Beranda, Dompet, Anggaran, Laporan, dan Rencana selalu sama.
 *
 * ```text
 * tagihan = sisa tagihan lalu + belanja periode ini + angsuran jatuh tempo periode ini
 * utang   = tagihan + angsuran yang jatuh tempo setelah periode ini
 * sisa limit = limit − utang
 * ```
 *
 * Transaksi cicilan mencatat angsuran pertama yang belum lunas sebagai belanja kartu;
 * angsuran berikutnya tidak punya transaksi dan dibawa ke `previousPeriodBill` saat
 * periode berganti. Angsuran yang jatuh tempo sebelum periode acuan dianggap sudah ada
 * di tagihan lalu.
 *
 * Alokasi pembayaran ke cicilan TIDAK memengaruhi angka di sini: uangnya sudah mengurangi
 * tagihan lalu lewat pembayaran. Memakainya lagi akan mengurangi utang dua kali.
 */
export interface CreditCardPosition {
  wallet: Wallet;
  /** Tagihan periode lalu yang belum dibayar. */
  previousDue: number;
  /** Belanja kartu periode ini di luar cicilan. */
  spending: number;
  /** Semua angsuran cicilan yang jatuh tempo di periode ini, termasuk angsuran pertama. */
  installmentDue: number;
  /** Total yang harus dilunasi dari kas: tagihan lalu + belanja + angsuran periode ini. */
  bill: number;
  /** Angsuran yang jatuh tempo setelah periode ini. */
  installmentUnbilled: number;
  /** Seluruh utang kartu = tagihan + angsuran belum ditagih. Sama dengan limit terpakai. */
  debt: number;
  payments: number;
  limit: number;
  available: number;
}

export type CreditCardTotals = Omit<CreditCardPosition, 'wallet'>;

export const isInstallmentTransaction = (transaction: Transaction) =>
  transaction.type === 'expense' && (transaction.installmentTenorMonths ?? 0) >= 2;

const cardSchedules = (installments: Transaction[], walletId: string) => installments
  .filter((transaction) => isInstallmentTransaction(transaction) && transaction.walletId === walletId)
  .map(installmentSchedule);
const cardDues = (installments: Transaction[], walletId: string) => cardSchedules(installments, walletId).flat();

const sumDues = (dues: Array<{ amount: number }>) => dues.reduce((sum, due) => sum + due.amount, 0);

/**
 * Angsuran yang menjadi tagihan baru di rentang `[from, to]` (YYYY-MM-DD) dan belum ada di
 * ledger kartu. Angsuran pertama dikecualikan karena sudah diposting sebagai transaksi.
 */
export function installmentChargesBetween(
  installments: Transaction[],
  walletId: string,
  from: string,
  to: string,
): number {
  return sumDues(cardSchedules(installments, walletId)
    .flatMap((schedule) => schedule.slice(1))
    .filter((due) => due.dueDate >= from && due.dueDate <= to));
}

/** Catatan penyesuaian saldo kartu saat angsuran sebuah periode dibawa ke tagihan. */
export const installmentCarryNote = (periodAlias: string) => `Angsuran cicilan ${periodAlias} masuk tagihan`;

/**
 * Periode acuan posisi kartu: periode berjalan, atau periode terakhir yang ditutup bila
 * belum ada yang dibuka (tagihannya belum dibawa ke mana pun).
 */
export function creditCardPeriod<T extends BudgetPeriod>(periods: T[], active?: T): T | undefined {
  if (active) return active;
  return periods
    .filter((period) => period.status === 'closed')
    .sort((a, b) => dayKey(b.end).localeCompare(dayKey(a.end)))[0];
}

/**
 * @param periodTransactions transaksi pada periode acuan.
 * @param installments seluruh transaksi cicilan lintas periode.
 * @param period periode acuan (lihat `creditCardPeriod`). Tanpa periode sama sekali,
 *   angsuran sampai hari ini dianggap sudah ditagih dan sisanya belum ditagih.
 */
export function creditCardPosition(
  wallet: Wallet,
  periodTransactions: Transaction[],
  installments: Transaction[],
  period?: PeriodRange,
  today: Date = new Date(),
): CreditCardPosition {
  const own = periodTransactions.filter((transaction) => !transaction.adjustment);
  const spending = own
    .filter((transaction) => transaction.type === 'expense'
      && transaction.walletId === wallet.id
      && !isInstallmentTransaction(transaction))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const installmentPostings = own
    .filter((transaction) => isInstallmentTransaction(transaction) && transaction.walletId === wallet.id)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const payments = own
    .filter((transaction) => transaction.type === 'transfer' && transaction.toWalletId === wallet.id)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  // Record lama belum punya baseline; rekonstruksi dari saldo ledger agar belanja periode
  // ini tidak terhitung dua kali sebagai tagihan lama.
  const openingBill = wallet.previousPeriodBill
    ?? Math.max(0, Math.abs(wallet.balance) - spending - installmentPostings + payments);
  const previousDue = Math.max(0, openingBill - payments);
  const end = period ? dayKey(period.end) : dayKey(today);
  const dues = cardDues(installments, wallet.id);
  const installmentDue = period
    ? sumDues(dues.filter((due) => due.dueDate >= dayKey(period.start) && due.dueDate <= end))
    : 0;
  const installmentUnbilled = sumDues(dues.filter((due) => due.dueDate > end));
  const bill = previousDue + spending + installmentDue;
  const debt = bill + installmentUnbilled;
  const limit = wallet.creditLimit ?? 0;
  return {
    wallet,
    previousDue,
    spending,
    installmentDue,
    bill,
    installmentUnbilled,
    debt,
    payments,
    limit,
    available: Math.max(0, limit - debt),
  };
}

export function creditCardPositions(
  wallets: Wallet[],
  periodTransactions: Transaction[],
  installments: Transaction[],
  period?: PeriodRange,
  today?: Date,
): CreditCardPosition[] {
  return wallets
    .filter((wallet) => wallet.kind === 'credit')
    .map((wallet) => creditCardPosition(wallet, periodTransactions, installments, period, today));
}

export function sumCreditCards(positions: CreditCardPosition[]): CreditCardTotals {
  const totals: CreditCardTotals = {
    previousDue: 0, spending: 0, installmentDue: 0, bill: 0,
    installmentUnbilled: 0, debt: 0, payments: 0, limit: 0, available: 0,
  };
  for (const position of positions) {
    (Object.keys(totals) as Array<keyof CreditCardTotals>).forEach((key) => {
      totals[key] += position[key];
    });
  }
  return totals;
}

/** Jumlah cicilan yang masih punya angsuran jatuh tempo setelah `after` (YYYY-MM-DD). */
export function runningInstallmentCount(installments: Transaction[], after: string): number {
  return installments.filter((transaction) => isInstallmentTransaction(transaction)
    && installmentSchedule(transaction).some((due) => due.dueDate > after)).length;
}

/** Angsuran yang jatuh tempo dalam satu bulan mulai `today`, untuk kapasitas bulanan. */
export function installmentsDueWithinMonth(installments: Transaction[], today: Date = new Date()): number {
  const from = dayKey(today);
  const until = dayKey(addDays(new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()), -1));
  return sumDues(installments
    .filter(isInstallmentTransaction)
    .flatMap(installmentSchedule)
    .filter((due) => due.dueDate >= from && due.dueDate <= until));
}

export interface UncarriedInstallmentCharge {
  period: BudgetPeriod;
  amount: number;
}

/**
 * Angsuran yang jatuh tempo di periode tertutup tetapi tidak pernah dibawa ke tagihan,
 * yaitu periode yang ditutup sebelum pembawaan angsuran otomatis ada. Penanda sebuah
 * periode sudah dibawa adalah penyesuaian kartu bercatatan `installmentCarryNote`.
 */
export function uncarriedInstallmentCharges(
  wallet: Wallet,
  installments: Transaction[],
  periods: BudgetPeriod[],
  transactions: Transaction[],
  active: BudgetPeriod,
): UncarriedInstallmentCharge[] {
  const ordered = [...periods].sort((a, b) => dayKey(a.start).localeCompare(dayKey(b.start)));
  const carried = new Set(transactions
    .filter((transaction) => transaction.adjustment && transaction.walletId === wallet.id)
    .map((transaction) => transaction.note));
  return ordered.flatMap((period, index) => {
    if (period.status !== 'closed' || dayKey(period.end) >= dayKey(active.start)) return [];
    if (carried.has(installmentCarryNote(period.alias))) return [];
    const next = ordered[index + 1];
    const to = next ? dayKey(addDays(new Date(next.start), -1)) : dayKey(period.end);
    const amount = installmentChargesBetween(installments, wallet.id, dayKey(period.start), to);
    return amount > 0 ? [{ period, amount }] : [];
  });
}
