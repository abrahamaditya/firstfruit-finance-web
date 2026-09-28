import type { BudgetPeriod, Transaction } from './types';
import { installmentPaymentAmount } from './installment-pricing';

export interface InstallmentDue {
  id: string;
  transactionId: string;
  title: string;
  walletId: string;
  dueDate: string;
  number: number;
  tenor: number;
  amount: number;
  paid: boolean;
}

/** Angsuran 1 jatuh pada bulan transaksi; berikutnya tiap bulan pada hari yang sama. */
export function installmentDueDate(transactionDate: string, number: number): string {
  const [year, month, day] = transactionDate.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(year, month + number - 2, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function installmentDuesForPeriod(
  installments: Transaction[],
  period: Pick<BudgetPeriod, 'start' | 'end'>,
): InstallmentDue[] {
  const start = period.start.slice(0, 10);
  const end = period.end.slice(0, 10);
  return installments.flatMap((transaction) => {
    const tenor = transaction.installmentTenorMonths ?? 0;
    if (tenor < 2 || transaction.amount <= 0) return [];
    const initialPaid = Math.min(tenor, Math.max(0, transaction.installmentInitialPaidMonths ?? 0));
    const completed = Math.min(tenor, Math.max(initialPaid, transaction.installmentPaidMonths ?? 0));
    if (completed >= tenor) return [];
    const title = (transaction.note || transaction.merchant || 'Cicilan kartu kredit')
      .replace(/\s*\(cicilan\s*\d+\s*\/\s*\d+\)\s*$/i, '').trim();
    const dues: InstallmentDue[] = [];
    for (let number = initialPaid + 1; number <= tenor; number += 1) {
      const dueDate = installmentDueDate(transaction.date, number);
      if (dueDate < start || dueDate > end) continue;
      dues.push({
        id: `${transaction.id}:${number}`,
        transactionId: transaction.id,
        title,
        walletId: transaction.walletId,
        dueDate,
        number,
        tenor,
        amount: installmentPaymentAmount(transaction, number),
        paid: number <= completed,
      });
    }
    return dues;
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
}

export function nextUnpaidInstallment(transaction: Transaction): InstallmentDue | null {
  const tenor = transaction.installmentTenorMonths ?? 0;
  const completed = Math.max(0, transaction.installmentPaidMonths ?? 0);
  if (tenor < 2 || completed >= tenor) return null;
  const number = completed + 1;
  return {
    id: `${transaction.id}:${number}`,
    transactionId: transaction.id,
    title: transaction.note || transaction.merchant || 'Cicilan kartu kredit',
    walletId: transaction.walletId,
    dueDate: installmentDueDate(transaction.date, number),
    number,
    tenor,
    amount: installmentPaymentAmount(transaction, number),
    paid: false,
  };
}
