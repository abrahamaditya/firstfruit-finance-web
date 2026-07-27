'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRepositories } from '../infrastructure/RepositoryProvider';
import {
  Wallet, Transaction, Budget, BudgetPeriod, Subscription, Receivable, Plan, Saving, Reminder, Beneficiary,
} from '../core/domain/types';
import {
  totalLiquidity, safeToSpend, budgetView, BudgetView, periodProgress, periodNet,
  totalReserved, reservedInWallet,
} from '../core/domain/calculations';
import {
  totalMonthlyBurden, isReminderDue, isEndingSoon, daysUntilBilling, daysUntilEnd,
} from '../core/domain/subscription';
import { billingDatesInRange } from '../core/domain/calendar';
import { PlanningContext, estimateMonthlyIncome } from '../core/domain/planning';

// Small helper: load a collection once.
function useCollection<T extends { id: string }>(pick: (r: ReturnType<typeof useRepositories>) => { list(): Promise<T[]> }) {
  const repos = useRepositories();
  const repository = pick(repos);
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await repository.list());
    } finally {
      setLoading(false);
    }
  }, [repository]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}

export function useWallets() {
  const { data: wallets, loading, reload } = useCollection<Wallet>(r => r.wallets);
  return { wallets, loading, reload, liquidity: totalLiquidity(wallets) };
}

export function useTransactions() {
  return useCollection<Transaction>(r => r.transactions);
}

export function useBudgets(): { budgets: BudgetView[]; raw: Budget[]; loading: boolean } {
  const { data, loading } = useCollection<Budget>(r => r.budgets);
  return { budgets: data.map(budgetView), raw: data, loading };
}

/** Tabungan: earmark uang nyata di dalam dompet debit. */
export function useSavings() {
  const { data, loading, reload } = useCollection<Saving>(r => r.savings);
  const active = data.filter(s => !s.archived);
  return {
    savings: active,
    all: data,
    loading,
    reload,
    reserved: totalReserved(active),
    reservedIn: (walletId: string) => reservedInWallet(walletId, active),
  };
}

/** Dashboard view-model: composes wallets + budgets + period into the home screen data. */
export function useDashboard() {
  const { wallets, liquidity } = useWallets();
  const { raw: budgets } = useBudgets();
  const { reserved } = useSavings();
  const { data: periods } = useCollection<BudgetPeriod>(r => r.periods);
  const period = periods.find(item => !item.closed) ?? periods[0];
  return {
    liquidity,
    reserved,
    // Dipakai beranda untuk menjabarkan asal angka "aman dibelanjakan".
    allocated: budgets.reduce((sum, b) => sum + b.allocated, 0),
    safeToSpend: safeToSpend(liquidity, budgets, reserved),
    period,
    progress: period ? periodProgress(period) : null,
    netSurplus: periodNet(liquidity, budgets),
    wallets,
  };
}

export interface SubscriptionView extends Subscription { daysToBilling: number; daysToEnd: number | null; reminderDue: boolean; endingSoon: boolean; }
export function useSubscriptions() {
  const { data, loading } = useCollection<Subscription>(r => r.subscriptions);
  const subs: SubscriptionView[] = data.map(s => ({
    ...s,
    daysToBilling: daysUntilBilling(s),
    daysToEnd: daysUntilEnd(s),
    reminderDue: isReminderDue(s),
    endingSoon: isEndingSoon(s),
  }));
  return { subs, loading, monthlyBurden: totalMonthlyBurden(data), reminders: subs.filter(s => s.reminderDue || s.endingSoon) };
}

export function useReceivables() {
  const { data, loading } = useCollection<Receivable>(r => r.receivables);
  const active = data.filter(r => !r.settled);
  return { receivables: data, active, settled: data.filter(r => r.settled), total: active.reduce((s, r) => s + r.amount, 0), loading };
}

export function usePlans() { return useCollection<Plan>(r => r.plans); }

/**
 * Konteks angka untuk layar Rencana: menggabungkan kas, anggaran, pemasukan rutin,
 * dan tagihan bulan depan (langganan + pengingat bernominal) jadi satu objek.
 */
export function usePlanningContext(): PlanningContext & { budgets: Budget[] } {
  const { liquidity } = useWallets();
  const { raw: budgets } = useBudgets();
  const { reserved } = useSavings();
  const { data: transactions } = useTransactions();
  const { data: subscriptions } = useCollection<Subscription>(r => r.subscriptions);
  const { reminders } = useReminders();
  const { total: receivableTotal } = useReceivables();
  const { data: periods } = useCollection<BudgetPeriod>(r => r.periods);
  const period = periods.find(item => !item.closed) ?? periods[0];
  const progress = period ? periodProgress(period) : null;

  const today = new Date();
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  const subsNextMonth = subscriptions.reduce(
    (sum, sub) => sum + billingDatesInRange(sub, nextMonthStart, nextMonthEnd).length * sub.amount, 0,
  );
  const remindersNextMonth = reminders
    .filter(r => !r.done && r.amount && new Date(r.date) >= nextMonthStart && new Date(r.date) <= nextMonthEnd)
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);

  return {
    budgets,
    available: liquidity - reserved,
    allocatedTotal: budgets.reduce((sum, b) => sum + b.allocated, 0),
    spentTotal: budgets.reduce((sum, b) => sum + b.spent, 0),
    monthlyIncome: estimateMonthlyIncome(transactions, today),
    nextMonthBills: Math.round(subsNextMonth + remindersNextMonth),
    expectedReceivables: receivableTotal,
    daysLeft: progress?.daysLeft ?? 0,
    totalDays: progress?.totalDays ?? 30,
  };
}

/** Daftar pihak terkait (gereja, keluarga, orang) untuk dipakai di transaksi. */
export function useBeneficiaries() {
  const { data, loading, reload } = useCollection<Beneficiary>(r => r.beneficiaries);
  const active = data.filter(entry => !entry.archived);
  return {
    beneficiaries: [...active].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
    all: data,
    nameOf: (id?: string) => (id ? data.find(entry => entry.id === id)?.name : undefined),
    loading,
    reload,
  };
}

/** Daftar periode anggaran, terbaru dulu. */
export function usePeriods() {
  const { data, loading, reload } = useCollection<BudgetPeriod>(r => r.periods);
  const sorted = [...data].sort((a, b) => +new Date(b.start) - +new Date(a.start));
  return { periods: sorted, active: sorted.find(p => !p.closed), loading, reload };
}

export function useReminders() {
  const { data, loading, reload } = useCollection<Reminder>(r => r.reminders);
  return { reminders: data, loading, reload };
}
