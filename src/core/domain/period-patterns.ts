import type { Budget, BudgetPeriod, Transaction } from './types';

const DAY_MS = 86_400_000;

const calendarDay = (value: Date | string) => {
  const date = new Date(value);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
};

const duration = (period: BudgetPeriod) =>
  Math.max(1, calendarDay(period.end) - calendarDay(period.start) + 1);

const isClosed = (period: BudgetPeriod) =>
  period.status === 'closed' || (period.status == null && period.closed);

const actualExpense = (transaction: Transaction) =>
  transaction.adjustment || transaction.type !== 'expense'
    ? 0 : Math.max(0, transaction.amount - (transaction.owedAmount ?? 0));

const actualIncome = (transaction: Transaction) =>
  !transaction.adjustment && transaction.type === 'income' && !transaction.settlesReceivableId
    ? transaction.amount : 0;

const inPeriod = (transaction: Transaction, period: BudgetPeriod) =>
  transaction.periodId
    ? transaction.periodId === period.id
    : calendarDay(transaction.date) >= calendarDay(period.start)
      && calendarDay(transaction.date) <= calendarDay(period.end);

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export interface PeriodPattern {
  period: BudgetPeriod;
  days: number;
  income: number;
  expense: number;
  net: number;
  incomePerDay: number;
  expensePerDay: number;
  budgetAllocated: number;
  budgetSpent: number;
  categories: Map<string, number>;
}

/** Periode yang sudah ditutup saja, diurut dari lama ke baru untuk dibaca sebagai tren. */
export function periodPatterns(
  periods: BudgetPeriod[], transactions: Transaction[], budgets: Budget[], limit = 8,
): PeriodPattern[] {
  return periods.filter(isClosed)
    .sort((a, b) => calendarDay(b.start) - calendarDay(a.start))
    .slice(0, limit)
    .reverse()
    .map((period) => {
      const entries = transactions.filter(transaction => inPeriod(transaction, period));
      const days = duration(period);
      const income = entries.reduce((sum, transaction) => sum + actualIncome(transaction), 0);
      const expense = entries.reduce((sum, transaction) => sum + actualExpense(transaction), 0);
      const categories = new Map<string, number>();
      entries.forEach((transaction) => {
        const amount = actualExpense(transaction);
        if (!amount) return;
        const category = transaction.labels[0] ?? '';
        categories.set(category, (categories.get(category) ?? 0) + amount);
      });
      const periodBudgets = budgets.filter(budget => budget.periodId === period.id);
      return {
        period, days, income, expense, net: income - expense,
        incomePerDay: Math.round(income / days),
        expensePerDay: Math.round(expense / days),
        budgetAllocated: periodBudgets.reduce((sum, budget) => sum + budget.allocated, 0),
        budgetSpent: periodBudgets.reduce((sum, budget) => sum + budget.spent, 0),
        categories,
      };
    });
}

export interface BudgetForecast {
  total: number;
  spent: number;
  historicalCategories: number;
  historicalPeriods: number;
  fallbackCategories: number;
}

/**
 * Memperkirakan realisasi anggaran, bukan seluruh pengeluaran. Untuk kategori yang punya
 * riwayat, porsi yang biasanya muncul setelah titik waktu ini diambil dari maksimal tiga
 * periode selesai. Biaya yang biasa dibayar di awal tidak dikalikan sepanjang bulan.
 * Tanpa riwayat, alokasi menjadi acuan awal dan laju aktual baru ikut ketika sudah
 * ada beberapa hari belanja; satu transaksi besar tidak dianggap tagihan harian.
 */
export function forecastBudgetRealization(
  period: BudgetPeriod,
  asOf: Date,
  activeBudgets: Budget[],
  periods: BudgetPeriod[],
  budgets: Budget[],
  transactions: Transaction[],
): BudgetForecast | null {
  const totalDays = duration(period);
  const elapsed = Math.min(totalDays, Math.max(0, calendarDay(asOf) - calendarDay(period.start) + 1));
  if (elapsed === 0 || elapsed >= totalDays || activeBudgets.length === 0) return null;
  const fraction = elapsed / totalDays;
  const previous = periods.filter(candidate => isClosed(candidate)
      && calendarDay(candidate.end) < calendarDay(period.start))
    .sort((a, b) => calendarDay(b.start) - calendarDay(a.start));
  let total = 0;
  let historicalCategories = 0;
  let fallbackCategories = 0;
  const usedPeriodIds = new Set<string>();

  activeBudgets.forEach((budget) => {
    const spent = Math.max(0, budget.spent);
    const key = budget.category.trim().toLocaleLowerCase();
    const matches = previous.flatMap((historicalPeriod) =>
      budgets.filter(candidate => candidate.periodId === historicalPeriod.id
        && candidate.category.trim().toLocaleLowerCase() === key)
        .map(candidate => ({ historicalPeriod, candidate })),
    ).slice(0, 3);

    if (matches.length) {
      historicalCategories += 1;
      matches.forEach(({ historicalPeriod }) => usedPeriodIds.add(historicalPeriod.id));
      const futureSamples = matches.map(({ historicalPeriod, candidate }) => {
        const pastDays = duration(historicalPeriod);
        // Durasi bulanan 28–31 hari tetap satu tagihan bulanan. Hanya periode dengan
        // durasi berbeda jauh yang diskalakan menurut hari.
        const scale = Math.abs(pastDays - totalDays) / totalDays <= 0.2
          ? 1 : totalDays / pastDays;
        const linked = transactions.filter(transaction => transaction.budgetId === candidate.id
          && transaction.type === 'expense' && !transaction.adjustment);
        const linkedTotal = linked.reduce((sum, transaction) => sum + transaction.amount, 0);
        const cutoff = calendarDay(historicalPeriod.start) + Math.ceil(fraction * pastDays) - 1;
        // Bila arsip transaksi tidak lengkap, tanggalnya tidak cukup untuk menyimpulkan
        // pengeluaran di muka/akhir. Gunakan pembagian waktu yang netral.
        const remainingShare = linkedTotal >= candidate.spent * 0.8 && linkedTotal > 0
          ? linked.filter(transaction => calendarDay(transaction.date) > cutoff)
            .reduce((sum, transaction) => sum + transaction.amount, 0) / linkedTotal
          : 1 - fraction;
        return { total: candidate.spent * scale, future: candidate.spent * scale * remainingShare };
      });
      const expectedTotal = median(futureSamples.map(sample => sample.total));
      const expectedFuture = median(futureSamples.map(sample => sample.future));
      const expectedSoFar = median(futureSamples.map(sample => sample.total - sample.future));
      // Kenaikan yang sudah terlihat boleh mengubah estimasi biaya tersisa sedikit,
      // tetapi tidak mengulang seluruh biaya awal seolah terjadi setiap hari.
      const ratio = expectedSoFar > 0 ? spent / expectedSoFar : 1;
      const adjustment = 1 + Math.max(-0.2, Math.min(0.35, (ratio - 1) * 0.35));
      // Tagihan rutin yang biasanya dibayar lebih awal tetap diperkirakan akan datang
      // bila bulan ini belum tercatat; ia tidak boleh hilang hanya karena terlambat.
      total += Math.max(spent + Math.max(0, expectedFuture * adjustment), expectedTotal);
      return;
    }

    fallbackCategories += 1;
    const spendDays = new Set(transactions.filter(transaction => transaction.budgetId === budget.id
      && transaction.type === 'expense' && !transaction.adjustment)
      .map(transaction => calendarDay(transaction.date))).size;
    const paceEnd = elapsed >= 7 && spendDays >= 3
      ? spent / elapsed * totalDays : budget.allocated;
    const paceWeight = elapsed >= 7 && spendDays >= 3 ? Math.min(0.65, fraction * 0.65) : 0;
    total += Math.max(spent, budget.allocated * (1 - paceWeight) + paceEnd * paceWeight);
  });

  return {
    total: Math.round(total),
    spent: activeBudgets.reduce((sum, budget) => sum + budget.spent, 0),
    historicalCategories,
    historicalPeriods: usedPeriodIds.size,
    fallbackCategories,
  };
}
