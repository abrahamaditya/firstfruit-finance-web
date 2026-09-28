import type { Transaction, Wallet } from './types';

export type InstallmentPricingMode = 'monthly' | 'item_total';

export interface InstallmentQuote {
  itemTotal: number;
  interestTotal: number;
  totalPayable: number;
  monthlyAmount: number;
  lastAmount: number;
}

/** Bunga di sini adalah nominal total sepanjang tenor, bukan bunga per bulan. */
export function installmentQuote(
  mode: InstallmentPricingMode,
  tenor: number,
  enteredAmount: number,
  interestTotal: number,
): InstallmentQuote | null {
  if (!Number.isInteger(tenor) || tenor < 2 || tenor > 120
    || !Number.isSafeInteger(enteredAmount) || enteredAmount <= 0
    || !Number.isSafeInteger(interestTotal) || interestTotal < 0) return null;
  const totalPayable = mode === 'monthly' ? enteredAmount * tenor : enteredAmount + interestTotal;
  const itemTotal = totalPayable - interestTotal;
  if (!Number.isSafeInteger(totalPayable) || itemTotal <= 0) return null;
  const base = Math.floor(totalPayable / tenor);
  return {
    itemTotal,
    interestTotal,
    totalPayable,
    monthlyAmount: Math.ceil(totalPayable / tenor),
    lastAmount: base,
  };
}

export function installmentTotalPayable(transaction: Transaction): number {
  const tenor = transaction.installmentTenorMonths ?? 0;
  return transaction.installmentItemTotal == null
    ? transaction.amount * tenor
    : transaction.installmentItemTotal + (transaction.installmentInterestTotal ?? 0);
}

/** Selisih pembulatan dibagikan Rp1 ke angsuran terawal; total tetap persis. */
export function installmentPaymentAmount(transaction: Transaction, number: number): number {
  const tenor = transaction.installmentTenorMonths ?? 0;
  if (tenor < 2 || number < 1 || number > tenor) return 0;
  const total = installmentTotalPayable(transaction);
  const base = Math.floor(total / tenor);
  return base + (number <= total % tenor ? 1 : 0);
}

export function installmentPaidAmount(transaction: Transaction, count: number): number {
  const tenor = transaction.installmentTenorMonths ?? 0;
  if (tenor < 2) return 0;
  const paid = Math.min(tenor, Math.max(0, Math.floor(count)));
  const total = installmentTotalPayable(transaction);
  return Math.floor(total / tenor) * paid + Math.min(total % tenor, paid);
}

export function installmentRemainingAmount(transaction: Transaction): number {
  return Math.max(0, installmentTotalPayable(transaction)
    - installmentPaidAmount(transaction, transaction.installmentPaidMonths ?? 0));
}

export interface CreditLimitBreakdown {
  otherBalance: number;
  installmentRemaining: number;
  used: number;
  available: number;
}

/**
 * Ledger lama mencatat satu angsuran saat transaksi dibuat. Pisahkan bagian itu
 * beserta pelunasan yang dialokasikan, lalu gantikan dengan SEMUA angsuran yang
 * belum lunas, termasuk transaksi dari periode sebelumnya. Cicilan lunas tetap
 * ikut rekonsiliasi karena pembayaran kartu sudah mengurangi saldo ledger.
 */
export function creditLimitBreakdown(wallet: Wallet, installments: Transaction[]): CreditLimitBreakdown {
  const cardInstallments = installments.filter((transaction) =>
    transaction.type === 'expense'
    && transaction.walletId === wallet.id
    && (transaction.installmentTenorMonths ?? 0) >= 2,
  );
  const recordedInstallmentBalance = cardInstallments.reduce((sum, transaction) => {
    const initialPaid = transaction.installmentInitialPaidMonths ?? 0;
    const paid = transaction.installmentPaidMonths ?? initialPaid;
    const paidSinceRecorded = installmentPaidAmount(transaction, paid)
      - installmentPaidAmount(transaction, initialPaid);
    return sum + transaction.amount - paidSinceRecorded;
  }, 0);
  const installmentRemaining = cardInstallments.reduce(
    (sum, transaction) => sum + installmentRemainingAmount(transaction), 0,
  );
  const otherBalance = wallet.balance - recordedInstallmentBalance;
  const used = Math.max(0, otherBalance + installmentRemaining);
  return {
    otherBalance,
    installmentRemaining,
    used,
    available: Math.max(0, (wallet.creditLimit ?? 0) - used),
  };
}
