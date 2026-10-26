import type { BudgetPeriod, Transaction } from './types';
import { installmentPaymentAmount } from './installment-pricing';
import { dayKey } from './calendar';

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

type DatedInstallment = Pick<Transaction, 'date' | 'installmentInitialPaidMonths'>;

/**
 * Tanggal tagih angsuran ke-`number` (YYYY-MM-DD, hari lokal).
 *
 * Transaksi cicilan hanya bisa dicatat di periode berjalan, dan nominalnya adalah angsuran
 * pertama yang belum lunas (`initialPaid + 1`). Angsuran itu jatuh pada tanggal transaksi;
 * angsuran berikutnya tiap bulan pada hari yang sama, dijepit ke hari terakhir bulan pendek.
 */
export function installmentDueDate(transaction: DatedInstallment, number: number): string {
  const [year, month, day] = dayKey(transaction.date).split('-').map(Number);
  const offset = number - (transaction.installmentInitialPaidMonths ?? 0) - 1;
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export const installmentTitle = (transaction: Transaction, fallback = 'Cicilan kartu kredit') =>
  (transaction.note || transaction.merchant || fallback)
    .replace(/\s*\(cicilan\s*\d+\s*\/\s*\d+\)\s*$/i, '').trim() || fallback;

/** Semua angsuran yang masih harus dibayar sejak transaksi dicatat. */
export function installmentSchedule(transaction: Transaction): InstallmentDue[] {
  const tenor = transaction.installmentTenorMonths ?? 0;
  if (transaction.type !== 'expense' || tenor < 2 || transaction.amount <= 0) return [];
  const initialPaid = Math.min(tenor, Math.max(0, transaction.installmentInitialPaidMonths ?? 0));
  const completed = Math.min(tenor, Math.max(initialPaid, transaction.installmentPaidMonths ?? 0));
  const title = installmentTitle(transaction);
  const dues: InstallmentDue[] = [];
  for (let number = initialPaid + 1; number <= tenor; number += 1) {
    dues.push({
      id: `${transaction.id}:${number}`,
      transactionId: transaction.id,
      title,
      walletId: transaction.walletId,
      dueDate: installmentDueDate(transaction, number),
      number,
      tenor,
      // Angsuran pertama memakai nominal yang benar-benar diposting ke kartu.
      amount: number === initialPaid + 1 ? transaction.amount : installmentPaymentAmount(transaction, number),
      paid: number <= completed,
    });
  }
  return dues;
}

/** Angsuran yang tanggal tagihnya berada di dalam periode (inklusif di kedua ujung). */
export function installmentDuesForPeriod(
  installments: Transaction[],
  period: Pick<BudgetPeriod, 'start' | 'end'>,
): InstallmentDue[] {
  const start = dayKey(period.start);
  const end = dayKey(period.end);
  return installments
    .flatMap(installmentSchedule)
    .filter((due) => due.dueDate >= start && due.dueDate <= end)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
}

export function nextUnpaidInstallment(transaction: Transaction): InstallmentDue | null {
  return installmentSchedule(transaction).find((due) => !due.paid) ?? null;
}
