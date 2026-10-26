'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRepositories } from '../infrastructure/RepositoryProvider';
import {
  Wallet, Transaction, Budget, BudgetPeriod, Subscription, Receivable, Plan, Saving, Reminder,
} from '../core/domain/types';
import {
  budgetView, BudgetView, periodProgress, remainingBudget, actualExpenseAmount,
  isActualIncome, isIncome, transactionInPeriod,
  totalReserved, reservedInWallet, totalAssets,
} from '../core/domain/calculations';
import {
  totalMonthlyBurden, isReminderDue, isEndingSoon, daysUntilBilling, daysUntilEnd,
} from '../core/domain/subscription';
import { PlanningContext, estimateMonthlyIncome } from '../core/domain/planning';
import {
  CreditCardPosition, CreditCardTotals, UncarriedInstallmentCharge, creditCardPeriod, creditCardPositions,
  installmentsDueWithinMonth, sumCreditCards, uncarriedInstallmentCharges,
} from '../core/domain/credit-card';
import { InstallmentDue, installmentDuesForPeriod } from '../core/domain/installment-schedule';

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
  return { wallets, loading, reload };
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

/** Seluruh cicilan kartu kredit, termasuk yang berasal dari periode arsip. */
export function useInstallments() {
  const result = useCollection<Transaction>(r => r.installments);
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
    return result.data.filter(transaction => transactionInPeriod(transaction, period));
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

export interface FinancialSnapshot {
  period?: BudgetPeriod;
  progress: ReturnType<typeof periodProgress> | null;
  wallets: Wallet[];
  /** Saldo rekening, e-wallet, dan tunai. */
  assets: number;
  /** Dana di tabungan; tetap di dompet tetapi tidak bebas dipakai. */
  reserved: number;
  /** Periode acuan posisi kartu: periode berjalan, atau periode terakhir yang ditutup. */
  cardPeriod?: BudgetPeriod;
  cards: CreditCardPosition[];
  card: CreditCardTotals;
  /** Angsuran dari periode yang ditutup sebelum pembawaan otomatis ada; belum ada di tagihan. */
  uncarried: Array<{ wallet: Wallet; charges: UncarriedInstallmentCharge[]; total: number }>;
  /** Σ max(alokasi − realisasi, 0) anggaran periode berjalan. */
  budgetRemaining: number;
  /** Angsuran cicilan yang jatuh tempo di periode berjalan (sudah termasuk di tagihan kartu). */
  installmentDues: InstallmentDue[];
  /** Arus kas bebas = saldo aset − tagihan kartu − tabungan − sisa anggaran. */
  safeToSpend: number;
  /** Likuiditas bersih = saldo aset − seluruh utang kartu (termasuk cicilan belum ditagih). */
  netLiquidity: number;
  loading: boolean;
}

/**
 * Satu-satunya tempat posisi keuangan periode berjalan dihitung. Beranda, Dompet,
 * Anggaran, Laporan, Periode, dan Rencana membaca dari sini supaya angkanya selalu sama.
 */
export function useDashboard(): FinancialSnapshot {
  const { wallets, loading: walletsLoading } = useWallets();
  const { raw: budgets, loading: budgetsLoading } = useBudgets();
  const { reserved, loading: savingsLoading } = useSavings();
  const { data: transactions, loading: transactionsLoading } = useTransactions();
  const { data: installments, loading: installmentsLoading } = useInstallments();
  const { data: periods, loading: periodsLoading } = useCollection<BudgetPeriod>(r => r.periods);
  const period = findActivePeriod(periods);
  const periodBudgets = period ? budgets.filter(budget => budget.periodId === period.id) : [];
  const cardPeriod = creditCardPeriod(periods, period);
  const cardTransactions = cardPeriod
    ? transactions.filter(transaction => transactionInPeriod(transaction, cardPeriod))
    : [];
  const cards = creditCardPositions(wallets, cardTransactions, installments, cardPeriod);
  const card = sumCreditCards(cards);
  const uncarried = period
    ? cards
      .map(({ wallet }) => {
        const charges = uncarriedInstallmentCharges(wallet, installments, periods, transactions, period);
        return { wallet, charges, total: charges.reduce((sum, charge) => sum + charge.amount, 0) };
      })
      .filter(entry => entry.total > 0)
    : [];
  const assets = totalAssets(wallets);
  const budgetRemaining = remainingBudget(periodBudgets);
  return {
    period,
    progress: period ? periodProgress(period) : null,
    wallets,
    assets,
    reserved,
    cardPeriod,
    cards,
    card,
    uncarried,
    budgetRemaining,
    installmentDues: period ? installmentDuesForPeriod(installments, period) : [],
    safeToSpend: assets - card.bill - reserved - budgetRemaining,
    netLiquidity: assets - card.debt,
    loading: walletsLoading || budgetsLoading || savingsLoading || transactionsLoading
      || installmentsLoading || periodsLoading,
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
  // Total = sisa yang belum dibayar, bukan nominal awal piutang.
  const total = active.reduce((sum, r) => sum + Math.max(0, r.amount - (r.paid ?? 0)), 0);
  return { receivables: data, active, settled, writtenOff, total, loading };
}

export function usePlans() { return useCollection<Plan>(r => r.plans); }

/** Konteks angka layar Rencana; posisi keuangannya sama persis dengan Beranda. */
export function usePlanningContext(): PlanningContext & { budgets: Budget[] } {
  const snapshot = useDashboard();
  const { raw: budgets } = useBudgets();
  const { data: transactions } = useTransactions();
  const { data: installments } = useInstallments();
  const { total: receivableTotal } = useReceivables();
  const periodBudgets = snapshot.period
    ? budgets.filter(budget => budget.periodId === snapshot.period?.id)
    : [];
  // Dari jadwal, bukan alokasi pembayaran: alokasi bersifat opsional.
  const installmentMonthly = installmentsDueWithinMonth(installments);

  return {
    budgets: periodBudgets,
    cashBalance: snapshot.assets,
    reserved: snapshot.reserved,
    cardBill: snapshot.card.bill,
    budgetRemaining: snapshot.budgetRemaining,
    available: snapshot.assets - snapshot.reserved - snapshot.card.bill,
    freeCash: snapshot.safeToSpend,
    allocatedTotal: periodBudgets.reduce((sum, budget) => sum + budget.allocated, 0),
    spentTotal: periodBudgets.reduce((sum, budget) => sum + budget.spent, 0),
    monthlyIncome: estimateMonthlyIncome(transactions, new Date()),
    installmentMonthly,
    expectedReceivables: receivableTotal,
    // Simulasi tidak mengenal periode lewat tanggal; sisa negatif dijepit ke 0.
    daysLeft: Math.max(0, snapshot.progress?.daysLeft ?? 0),
    totalDays: snapshot.progress?.totalDays ?? 30,
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
  /** Periode berjalan — hanya di sini posisi kas (arus kas bebas) masih berarti. */
  isActive: boolean;
  progress: ReturnType<typeof periodProgress> | null;
  income: number;
  actualIncome: number;
  expense: number;
  actualExpense: number;
  /** Arus kas riil = pemasukan riil − pengeluaran riil. */
  net: number;
  txCount: number;
  budgets: BudgetView[];
  allocated: number;
  spent: number;
  /** Kategori pengeluaran terbesar di periode ini, urut menurun. */
  categories: Array<{ name: string; total: number }>;
  snapshot: FinancialSnapshot;
  loading: boolean;
}

/**
 * Laporan satu periode, termasuk arsip. Arus masuk/keluar dibatasi periode yang diminta;
 * posisi kas hanya bermakna untuk periode berjalan dan diambil dari `useDashboard`.
 */
export function usePeriodReport(periodId?: string | null): PeriodReport {
  const { periods, loading: periodsLoading } = usePeriods();
  const { data: transactions, loading: txLoading } = useTransactions();
  const { raw: budgets, loading: budgetsLoading } = useBudgets();
  const snapshot = useDashboard();

  const period = periods.find(item => item.id === periodId)
    ?? findActivePeriod(periods)
    ?? periods[0];
  const isActive = Boolean(
    period
    && (period.status === 'open' || (period.status == null && !period.closed)),
  );

  // Transfer hanya memindahkan uang dan penyesuaian saldo bukan belanja nyata.
  const inPeriod = period
    ? transactions.filter(tx => transactionInPeriod(tx, period) && !tx.adjustment && tx.type !== 'transfer')
    : [];
  const income = inPeriod.filter(isIncome).reduce((sum, tx) => sum + tx.amount, 0);
  const actualIncome = inPeriod.filter(isActualIncome).reduce((sum, tx) => sum + tx.amount, 0);
  const expenses = inPeriod.filter(tx => tx.type === 'expense');
  const expense = expenses.reduce((sum, tx) => sum + tx.amount, 0);
  const actualExpense = expenses.reduce((sum, tx) => sum + actualExpenseAmount(tx), 0);

  // Anggaran tanpa `periodId` hanya bisa berasal dari periode berjalan (data lama).
  const periodBudgets = budgets.filter(b => (b.periodId ? b.periodId === period?.id : isActive));
  const totals = new Map<string, number>();
  expenses.forEach(tx => {
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
    actualExpense,
    net: actualIncome - actualExpense,
    txCount: inPeriod.length,
    budgets: periodBudgets.map(budgetView),
    allocated: periodBudgets.reduce((sum, b) => sum + b.allocated, 0),
    spent: periodBudgets.reduce((sum, b) => sum + b.spent, 0),
    categories: [...totals.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6),
    snapshot,
    loading: periodsLoading || txLoading || budgetsLoading || snapshot.loading,
  };
}

export function useReminders() {
  const { data, loading, reload } = useCollection<Reminder>(r => r.reminders);
  return { reminders: data, loading, reload };
}
