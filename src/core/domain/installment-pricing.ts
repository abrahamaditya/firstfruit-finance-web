import type { Transaction } from './types';

export type InstallmentPricingMode = 'monthly' | 'item_total';

export interface InstallmentQuote {
  itemTotal: number;
  interestTotal: number;
  totalPayable: number;
  /** Nominal angsuran pertama yang belum lunas (yang diposting ke kartu). */
  monthlyAmount: number;
  lastAmount: number;
}

/**
 * Nominal angsuran ke-`number` (1-based). Mengikuti bank (mis. BCA): angsuran dibulatkan ke
 * bawah, dan sisa pembulatan Rp1 masuk ke angsuran paling akhir; total tetap persis.
 */
export function installmentAmountAt(total: number, tenor: number, number: number): number {
  if (tenor < 1 || number < 1 || number > tenor) return 0;
  return Math.floor(total / tenor) + (number > tenor - (total % tenor) ? 1 : 0);
}

/** Jumlah `count` angsuran pertama. */
export function installmentPaidTotal(total: number, tenor: number, count: number): number {
  if (tenor < 1) return 0;
  const paid = Math.min(tenor, Math.max(0, Math.floor(count)));
  return Math.floor(total / tenor) * paid + Math.max(0, paid - (tenor - (total % tenor)));
}

/** Bunga di sini adalah nominal total sepanjang tenor, bukan bunga per bulan. */
export function installmentQuote(
  mode: InstallmentPricingMode,
  tenor: number,
  enteredAmount: number,
  interestTotal: number,
  initialPaidMonths = 0,
): InstallmentQuote | null {
  if (!Number.isInteger(tenor) || tenor < 2 || tenor > 120
    || !Number.isSafeInteger(enteredAmount) || enteredAmount <= 0
    || !Number.isSafeInteger(interestTotal) || interestTotal < 0) return null;
  const totalPayable = mode === 'monthly' ? enteredAmount * tenor : enteredAmount + interestTotal;
  const itemTotal = totalPayable - interestTotal;
  if (!Number.isSafeInteger(totalPayable) || itemTotal <= 0) return null;
  const firstUnpaid = Math.min(tenor, Math.max(0, Math.floor(initialPaidMonths))) + 1;
  return {
    itemTotal,
    interestTotal,
    totalPayable,
    monthlyAmount: installmentAmountAt(totalPayable, tenor, Math.min(tenor, firstUnpaid)),
    lastAmount: installmentAmountAt(totalPayable, tenor, tenor),
  };
}

export function installmentTotalPayable(transaction: Transaction): number {
  const tenor = transaction.installmentTenorMonths ?? 0;
  return transaction.installmentItemTotal == null
    ? transaction.amount * tenor
    : transaction.installmentItemTotal + (transaction.installmentInterestTotal ?? 0);
}

export function installmentPaymentAmount(transaction: Transaction, number: number): number {
  const tenor = transaction.installmentTenorMonths ?? 0;
  if (tenor < 2) return 0;
  return installmentAmountAt(installmentTotalPayable(transaction), tenor, number);
}

export function installmentPaidAmount(transaction: Transaction, count: number): number {
  const tenor = transaction.installmentTenorMonths ?? 0;
  if (tenor < 2) return 0;
  return installmentPaidTotal(installmentTotalPayable(transaction), tenor, count);
}

export function installmentRemainingAmount(transaction: Transaction): number {
  return Math.max(0, installmentTotalPayable(transaction)
    - installmentPaidAmount(transaction, transaction.installmentPaidMonths ?? 0));
}
