'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRepositories } from '../infrastructure/RepositoryProvider';
import {
  Wallet, Transaction, Budget, BudgetPeriod, Subscription, Receivable, Plan, Saving, Reminder,
} from '../core/domain/types';
import {
  totalLiquidity, safeToSpend, budgetView, BudgetView, periodProgress, periodNet, remainingBudget,
  isActualIncome, isIncome,
  totalReserved, reservedInWallet,
} from '../core/domain/calculations';
import {
  totalMonthlyBurden, isReminderDue, isEndingSoon, daysUntilBilling, daysUntilEnd,
} from '../core/domain/subscription';
import { PlanningContext, estimateMonthlyIncome } from '../core/domain/planning';

type CollectionCacheEntry<T> = {
  data?: T[];
  request?: Promise<T[]>;
  listeners: Set<(data: T[]) => void>;
};

// Cache mengikuti instance repository, sehingga otomatis terpisah per workspace dan
// dibuang GC ketika pengguna keluar. Halaman yang di-mount ulang langsung memakai data
// terakhir, lalu melakukan revalidasi di background (stale-while-revalidate).
const collectionCache = new WeakMap<object, CollectionCacheEntry<unknown>>();

function cacheFor<T>(repository: object): CollectionCacheEntry<T> {
  let entry = collectionCache.get(repository) as CollectionCacheEntry<T> | undefined;
  if (!entry) {
    entry = { listeners: new Set() };
    collectionCache.set(repository, entry as CollectionCacheEntry<unknown>);
  }
  return entry;
}

// Shared collection loader. `version` memaksa revalidasi setelah mutasi, tetapi data
// lama tetap dirender sampai respons baru datang agar UI tidak berkedip ke empty state.
function useCollection<T extends { id: string }>(
  pick: (r: ReturnType<typeof useRepositories>) => { list(): Promise<T[]> },
  version = 0,
) {
  const repos = useRepositories();
  const repository = pick(repos);
  const entry = cacheFor<T>(repository);
  const [data, setData] = useState<T[]>(() => entry.data ?? []);
  const [loading, setLoading] = useState(() => entry.data === undefined);

  const reload = useCallback(async () => {
    const current = cacheFor<T>(repository);
    if (current.data === undefined) setLoading(true);
    try {
      if (!current.request) {
        current.request = repository.list()
          .then((fresh) => {
            current.data = fresh;
            current.listeners.forEach((listener) => listener(fresh));
            return fresh;
          })
          .finally(() => {
            current.request = undefined;
          });
      }
      const fresh = await current.request;
      setData(fresh);
    } finally {
      setLoading(false);
    }
    // `version` sengaja jadi dependensi walau tidak dipakai di badan fungsi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, version]);

  useEffect(() => {
    const current = cacheFor<T>(repository);
    const receive = (fresh: T[]) => setData(fresh);
    current.listeners.add(receive);
    if (current.data !== undefined) {
      setData(current.data);
      setLoading(false);
    }
    void reload().catch(() => {
      // Data cache tetap dipertahankan saat refresh jaringan gagal. Error operasional
      // ditangani oleh aksi pengguna; perpindahan halaman tidak boleh meruntuhkan UI.
    });
    return () => {
      current.listeners.delete(receive);
    };
  }, [reload, repository]);

  return { data, loading, reload };
}

export function useWallets() {
  const { data: wallets, loading, reload } = useCollection<Wallet>(r => r.wallets);
  return { wallets, loading, reload, liquidity: totalLiquidity(wallets) };
}

export function useTransactions() {
  const result = useCollection<Transaction>(r => r.transactions);
  // Konsumen riwayat penuh maupun filter periode aktif mengandalkan urutan menurun
  // menurut tanggal kejadian. Urutan itu ditegakkan sekali di sini, bukan diserahkan ke tiap repositori: repo memori
  // menaruh entri baru di akhir, dan repo Supabase bisa saja berubah pengurutannya.
  // Sort JavaScript bersifat stabil, jadi transaksi bertanggal sama tetap memakai urutan
  // dari repositori (waktu pencatatan, terbaru dulu).
  const data = useMemo(
    () => [...result.data].sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [result.data],
  );
  return { ...result, data };
}

/** Transaksi untuk periode yang dipilih; tanpa id, gunakan periode berjalan. */
export function usePeriodTransactions(periodId?: string | null) {
  const result = useTransactions();
  const { periods, active, loading: periodLoading } = usePeriods();
  const period = periods.find((entry) => entry.id === periodId) ?? active;
  const data = useMemo(() => {
    if (!period || period.status === 'draft') return [];
    const start = new Date(period.start);
    const end = new Date(period.end);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return result.data.filter(transaction => {
      if (transaction.periodId) return transaction.periodId === period.id;
      const occurredAt = new Date(transaction.date);
      return occurredAt >= start && occurredAt <= end;
    });
  }, [period, result.data]);

  return {
    ...result,
    data,
    period,
    activePeriod: active,
    isArchive: period?.status === 'closed',
    loading: result.loading || periodLoading,
  };
}

/** Aktivitas operasional selalu mengikuti periode yang sedang dibuka. */
export function useActivePeriodTransactions() {
  return usePeriodTransactions(null);
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

// Hanya periode berstatus open yang aktif. Draft adalah periode berikutnya yang belum
// berjalan, sedangkan fallback tanpa status dipertahankan untuk record lama.
function findActivePeriod(periods: BudgetPeriod[]) {
  return periods.find(period => period.status === 'open')
    ?? periods.find(period => period.status == null && !period.closed);
}

/** Dashboard view-model: composes wallets + budgets + period into the home screen data. */
export function useDashboard() {
  const { wallets, liquidity, loading: walletsLoading } = useWallets();
  const { raw: budgets, loading: budgetsLoading } = useBudgets();
  const { reserved, loading: savingsLoading } = useSavings();
  const { data: periods, loading: periodsLoading } = useCollection<BudgetPeriod>(r => r.periods);
  const period = findActivePeriod(periods);
  const periodBudgets = period
    ? budgets.filter(budget => budget.periodId === period.id)
    : [];
  return {
    liquidity,
    reserved,
    // Dipakai beranda untuk menjabarkan asal angka "aman dibelanjakan".
    allocated: remainingBudget(periodBudgets),
    safeToSpend: safeToSpend(liquidity, periodBudgets, reserved),
    period,
    progress: period ? periodProgress(period) : null,
    netSurplus: periodNet(liquidity, periodBudgets),
    wallets,
    loading: walletsLoading || budgetsLoading || savingsLoading || periodsLoading,
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
  // `written_off` adalah penghapusan administratif, bukan uang yang sudah diterima.
  // Data lama tanpa status tetap mempertahankan perilaku sebelumnya lewat `settled`.
  const active = data.filter(r => r.status ? r.status === 'open' || r.status === 'partial' : !r.settled);
  const settled = data.filter(r => r.status ? r.status === 'settled' : r.settled);
  const writtenOff = data.filter(r => r.status === 'written_off');
  return { receivables: data, active, settled, writtenOff, total: active.reduce((s, r) => s + r.amount, 0), loading };
}

export function usePlans() { return useCollection<Plan>(r => r.plans); }

/**
 * Konteks angka untuk layar Rencana: menggabungkan kas, anggaran, pemasukan rutin,
 * dan tagihan kartu kredit berjalan yang perlu disiapkan untuk bulan berikutnya.
 */
export function usePlanningContext(): PlanningContext & { budgets: Budget[] } {
  const { wallets } = useWallets();
  const { raw: budgets } = useBudgets();
  const { reserved } = useSavings();
  const { data: transactions } = useTransactions();
  const { total: receivableTotal } = useReceivables();
  const { data: periods } = useCollection<BudgetPeriod>(r => r.periods);
  const period = findActivePeriod(periods);
  const progress = period ? periodProgress(period) : null;
  const periodBudgets = period
    ? budgets.filter(budget => budget.periodId === period.id)
    : [];

  const today = new Date();
  // Saldo dompet kredit adalah tagihan berjalan: transaksi belanja menambah saldo,
  // sedangkan pembayaran kartu menguranginya. Memakai saldo ini membuat Rencana selalu
  // konsisten dengan angka "Tagihan terpakai" pada halaman Dompet.
  const creditBillNextMonth = wallets
    .filter(wallet => wallet.kind === 'credit')
    .reduce((sum, wallet) => sum + Math.max(0, wallet.balance), 0);
  const cashBalance = wallets
    .filter(wallet => wallet.kind !== 'credit')
    .reduce((sum, wallet) => sum + wallet.balance, 0);
  const allocatedTotal = periodBudgets.reduce((sum, budget) => sum + budget.allocated, 0);
  const budgetRemaining = remainingBudget(periodBudgets);

  return {
    budgets: periodBudgets,
    cashBalance,
    reserved,
    budgetRemaining,
    available: cashBalance - reserved - creditBillNextMonth,
    financialCondition: cashBalance - reserved - creditBillNextMonth - budgetRemaining,
    allocatedTotal,
    spentTotal: periodBudgets.reduce((sum, b) => sum + b.spent, 0),
    monthlyIncome: estimateMonthlyIncome(transactions, today),
    nextMonthBills: Math.round(creditBillNextMonth),
    expectedReceivables: receivableTotal,
    // Konteks simulasi tidak mengenal periode lewat tanggal — sisa negatif tidak punya
    // arti untuk "kalau saya belanja segini, per hari turun berapa", jadi dijepit di sini.
    daysLeft: Math.max(0, progress?.daysLeft ?? 0),
    totalDays: progress?.totalDays ?? 30,
  };
}

/** Daftar periode anggaran, terbaru dulu. */
export function usePeriods(version = 0) {
  const { data, loading, reload } = useCollection<BudgetPeriod>(r => r.periods, version);
  const sorted = [...data].sort((a, b) => +new Date(b.start) - +new Date(a.start));
  return { periods: sorted, active: findActivePeriod(sorted), loading, reload };
}

export interface PeriodReport {
  period?: BudgetPeriod;
  /** Periode berjalan — hanya di sini angka kas/aman-dibelanjakan masih berarti. */
  isActive: boolean;
  progress: ReturnType<typeof periodProgress> | null;
  income: number;
  actualIncome: number;
  expense: number;
  net: number;
  txCount: number;
  budgets: BudgetView[];
  allocated: number;
  spent: number;
  /** Kategori pengeluaran terbesar di periode ini, urut menurun. */
  categories: Array<{ name: string; total: number }>;
  liquidity: number;
  reserved: number;
  safeToSpend: number;
  loading: boolean;
}

/**
 * Laporan satu periode. Berbeda dengan `useDashboard` yang selalu bicara "sekarang",
 * angka di sini dibatasi rentang tanggal periode yang diminta — jadi periode yang
 * sudah ditutup tetap bisa dibaca ulang sebagai arsip.
 */
export function usePeriodReport(periodId?: string | null): PeriodReport {
  const { periods, loading: periodsLoading } = usePeriods();
  const { data: transactions, loading: txLoading } = useTransactions();
  const { raw: budgets, loading: budgetsLoading } = useBudgets();
  const { liquidity, loading: walletsLoading } = useWallets();
  const { reserved, loading: savingsLoading } = useSavings();

  const period = periods.find(item => item.id === periodId)
    ?? findActivePeriod(periods)
    ?? periods[0];
  const isActive = Boolean(
    period
    && (period.status === 'open' || (period.status == null && !period.closed)),
  );

  const from = period ? +new Date(period.start) : 0;
  const to = period ? +new Date(period.end) : 0;
  // Penyesuaian saldo bukan belanja nyata, transfer cuma memindahkan uang — keduanya
  // dikecualikan supaya pemasukan/pengeluaran periode mencerminkan arus kas sebenarnya.
  const inPeriod = period
    ? transactions.filter(tx => {
      const at = +new Date(tx.date);
      return !tx.adjustment && tx.type !== 'transfer' && at >= from && at <= to;
    })
    : [];
  const income = inPeriod.filter(isIncome).reduce((sum, tx) => sum + tx.amount, 0);
  const actualIncome = inPeriod.filter(isActualIncome).reduce((sum, tx) => sum + tx.amount, 0);
  const expense = inPeriod.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);

  // Anggaran tanpa `periodId` hanya bisa berasal dari periode berjalan (data lama).
  const periodBudgets = budgets.filter(b => (b.periodId ? b.periodId === period?.id : isActive));

  const totals = new Map<string, number>();
  inPeriod
    .filter(tx => tx.type === 'expense')
    .forEach(tx => {
      const label = tx.labels[0];
      if (label) totals.set(label, (totals.get(label) ?? 0) + tx.amount);
    });

  return {
    period,
    isActive,
    progress: period ? periodProgress(period) : null,
    income,
    actualIncome,
    expense,
    net: actualIncome - expense,
    txCount: inPeriod.length,
    budgets: periodBudgets.map(budgetView),
    allocated: periodBudgets.reduce((sum, b) => sum + b.allocated, 0),
    spent: periodBudgets.reduce((sum, b) => sum + b.spent, 0),
    categories: [...totals.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6),
    liquidity,
    reserved,
    safeToSpend: safeToSpend(liquidity, periodBudgets, reserved),
    loading: periodsLoading || txLoading || budgetsLoading || walletsLoading || savingsLoading,
  };
}

export function useReminders() {
  const { data, loading, reload } = useCollection<Reminder>(r => r.reminders);
  return { reminders: data, loading, reload };
}
