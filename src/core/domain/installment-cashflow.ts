import type { BudgetPeriod, Transaction, Wallet } from './types';
import { creditObligationBreakdown } from './calculations';
import { installmentPaidAmount } from './installment-pricing';
import { installmentDuesForPeriod } from './installment-schedule';

export interface InstallmentCashflow {
  /** Angsuran jatuh tempo yang belum dibayar dalam periode ini. */
  unpaid: number;
  /** Bagian angsuran tersebut yang telah tercatat dalam tagihan kartu. */
  coveredByPreviousBill: number;
  coveredByCurrentBill: number;
  /** Cadangan tambahan setelah bagian yang sudah ditagihkan dikecualikan. */
  additionalReserve: number;
}

/**
 * Angsuran yang belum dibayar masuk anggaran periode jatuh tempo. Satu angsuran
 * awal juga tercatat sebagai transaksi kartu; bila masih ada dalam tagihan, bagian
 * itu dikeluarkan dari komponen tagihan pada rumus arus kas bebas agar tidak ganda.
 */
export function installmentCashflowForPeriod(
  wallets: Wallet[],
  periodTransactions: Transaction[],
  installments: Transaction[],
  period: Pick<BudgetPeriod, 'start' | 'end'>,
): InstallmentCashflow {
  const dues = installmentDuesForPeriod(installments, period).filter(due => !due.paid);
  const unpaid = dues.reduce((sum, due) => sum + due.amount, 0);
  const periodTransactionIds = new Set(periodTransactions.map(transaction => transaction.id));
  const duesByTransaction = new Map<string, number>();
  dues.forEach(due => duesByTransaction.set(
    due.transactionId, (duesByTransaction.get(due.transactionId) ?? 0) + due.amount,
  ));

  let coveredByPreviousBill = 0;
  let coveredByCurrentBill = 0;
  for (const wallet of wallets.filter(item => item.kind === 'credit')) {
    const bill = creditObligationBreakdown([wallet], periodTransactions);
    let previousCoverage = 0;
    let currentCoverage = 0;
    for (const transaction of installments.filter(item => item.walletId === wallet.id)) {
      const dueAmount = duesByTransaction.get(transaction.id) ?? 0;
      if (!dueAmount) continue;
      const initialPaid = transaction.installmentInitialPaidMonths ?? 0;
      const paid = transaction.installmentPaidMonths ?? initialPaid;
      const paidSinceRecorded = installmentPaidAmount(transaction, paid)
        - installmentPaidAmount(transaction, initialPaid);
      const recordedBalance = Math.max(0, transaction.amount - paidSinceRecorded);
      const covered = Math.min(dueAmount, recordedBalance);
      if (periodTransactionIds.has(transaction.id)) currentCoverage += covered;
      else previousCoverage += covered;
    }
    coveredByPreviousBill += Math.min(previousCoverage, bill.previousPeriodDue);
    coveredByCurrentBill += Math.min(currentCoverage, bill.currentPeriodDue);
  }

  return {
    unpaid,
    coveredByPreviousBill,
    coveredByCurrentBill,
    additionalReserve: unpaid - coveredByPreviousBill - coveredByCurrentBill,
  };
}
