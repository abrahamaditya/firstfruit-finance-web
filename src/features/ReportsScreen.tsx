'use client';

import React, { useState } from 'react';
import { useBudgets, useDashboard, useTransactions } from '../application/hooks';
import { useUI, useMoney, useT } from '../components/AppShell';
import { Chevron, Download, TrendUp } from '../components/ui/icons';
import { addDays, dayKey, startOfDay } from '../core/domain/calendar';
import { actualExpenseAmount, isActualExpense, isActualIncome, isIncome } from '../core/domain/calculations';
import { categoryPath } from '../core/domain/categories';
import {
  categoryTree, groupBy, isHabitualExpense, longestNoSpendStreak, noSpendDays,
  projectedSpending, runwayDays, transactionPath, weekdayPattern,
} from '../core/domain/report-insights';
import type { Transaction, TransactionBenefitScope } from '../core/domain/types';

type Range = 'daily' | 'activePeriod' | '3months' | '6months';
type Flow = 'expense' | 'actualExpense' | 'income' | 'actualIncome';

const CATEGORY_COLORS = ['#5BE9AA', '#8AB6F9', '#F5C26B', '#EF8676', '#B69AF6', '#71D4E8', '#E99AD1', '#9BC982'];

interface TrendBucket {
  key: string;
  label: string;
}

const cashDelta = (transaction: Pick<Transaction, 'type' | 'amount'>) => {
  if (transaction.type === 'income') return transaction.amount;
  if (transaction.type === 'expense') return -transaction.amount;
  return 0;
};

const realCashflowDelta = (transaction: Transaction) => {
  if (isActualIncome(transaction)) return transaction.amount;
  if (isActualExpense(transaction)) return -actualExpenseAmount(transaction);
  return 0;
};

const benefitScopeOf = (transaction: Transaction): TransactionBenefitScope => {
  if (transaction.type !== 'expense') return 'self';
  if (transactionPath(transaction)[0] === 'Giving') return 'other';
  return transaction.benefitScope === 'shared' ? 'shared' : 'self';
};

const monthKey = (value: Date | string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const calendarDays = (from: Date, to: Date) => {
  let count = 0;
  const cursor = new Date(from);
  while (cursor <= to) {
    count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(1, count);
};

const trendBucketsFor = (range: Range, from: Date, to: Date, locale: string): TrendBucket[] => {
  const monthly = range === '3months' || range === '6months';
  const buckets: TrendBucket[] = [];
  const cursor = monthly
    ? new Date(from.getFullYear(), from.getMonth(), 1)
    : new Date(from);

  while (cursor <= to) {
    if (monthly) {
      const labelOptions: Intl.DateTimeFormatOptions = { month: 'short' };
      if (range === '6months') labelOptions.year = '2-digit';
      buckets.push({
        key: monthKey(cursor),
        label: cursor.toLocaleDateString(locale, labelOptions),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    } else {
      buckets.push({
        key: dayKey(cursor),
        label: cursor.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return buckets;
};

const sampledAxisLabels = (buckets: TrendBucket[]) => {
  if (buckets.length <= 6) return buckets;
  const step = Math.ceil((buckets.length - 1) / 5);
  return buckets.filter((_, index) =>
    index === 0 || index === buckets.length - 1 || index % step === 0,
  );
};

/** 7 Januari 2024 jatuh di hari Minggu — jangkar tetap untuk menamai indeks getDay(). */
const weekdayLabel = (weekday: number, locale: string, long = false) =>
  new Date(2024, 0, 7 + weekday).toLocaleDateString(locale, { weekday: long ? 'long' : 'short' });

export default function ReportsScreen() {
  const ui = useUI();
  const moneyBase = useMoney();
  // Laporan dipakai untuk membaca angka dan mengambil keputusan, sehingga semua nominal
  // sengaja memakai format penuh. Komponen lain tetap boleh memakai format ringkas.
  const money = {
    ...moneyBase,
    fmtCompact: moneyBase.fmt,
    fmtCompactSigned: moneyBase.fmtSigned,
  };
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const { data: allTransactions } = useTransactions();
  const { budgets } = useBudgets();
  const dashboard = useDashboard();
  const [range, setRange] = useState<Range>('activePeriod');
  const [flow, setFlow] = useState<Flow>('expense');
  const [openSector, setOpenSector] = useState<string | null>(null);
  const [openWeekday, setOpenWeekday] = useState<number | null>(null);
  const [weekdayScope, setWeekdayScope] = useState('all');
  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null);

  const today = startOfDay(new Date());
  const activePeriodEnd = dashboard.period
    ? startOfDay(new Date(dashboard.period.end))
    : today;
  const rangeEnd = range === 'activePeriod' && activePeriodEnd < today
    ? activePeriodEnd
    : today;
  const requestedRangeStart = (() => {
    if (range === 'daily') return addDays(rangeEnd, -6);
    if (range === 'activePeriod') {
      return dashboard.period
        ? startOfDay(new Date(dashboard.period.start))
        : new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
    }
    const months = range === '3months' ? 3 : 6;
    return new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - months + 1, 1);
  })();
  // Data periode draft/future tidak boleh membuat rentang terbalik.
  const rangeStart = requestedRangeStart <= rangeEnd ? requestedRangeStart : rangeEnd;
  const rangeEndExclusive = addDays(rangeEnd, 1);
  const inSelectedRange = (transaction: Transaction) => {
    const at = new Date(transaction.date);
    return at >= rangeStart && at < rangeEndExclusive;
  };

  // Penyesuaian saldo bukan perilaku pemasukan/pengeluaran dan transfer netral terhadap
  // arus kas. Keduanya tetap diperhitungkan secara tepat di rekonstruksi tren saldo.
  const transactions = allTransactions.filter(
    transaction => !transaction.adjustment && inSelectedRange(transaction),
  );
  const expenses = transactions.filter(transaction => transaction.type === 'expense');
  const incomeTransactions = transactions.filter(isIncome);
  const actualIncomeTransactions = transactions.filter(isActualIncome);
  const transfers = transactions.filter(transaction => transaction.type === 'transfer');
  const transferVolume = transfers.reduce((sum, transaction) => sum + transaction.amount, 0);
  const actualExpenseTransactions = expenses
    .map(transaction => ({ ...transaction, amount: actualExpenseAmount(transaction) }))
    .filter(transaction => transaction.amount > 0);
  const income = incomeTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const actualIncome = actualIncomeTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const spending = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const actualExpense = actualExpenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const benefitRows: Array<{
    scope: TransactionBenefitScope;
    label: string;
    color: string;
    total: number;
    count: number;
  }> = [
    { scope: 'self', label: t('reports.benefitSelf'), color: '#8AB6F9', total: 0, count: 0 },
    { scope: 'shared', label: t('reports.benefitShared'), color: '#F5C26B', total: 0, count: 0 },
    { scope: 'other', label: t('reports.benefitOther'), color: '#B69AF6', total: 0, count: 0 },
  ];
  // Membentuk piutang bukan pemanfaatan dana. Walaupun ia dicatat sebagai expense
  // untuk arus kas bruto, nominalnya tidak boleh masuk ringkasan penggunaan.
  expenses.filter((transaction) => !transaction.isReceivable).forEach((transaction) => {
    const row = benefitRows.find((item) => item.scope === benefitScopeOf(transaction));
    if (!row) return;
    row.total += transaction.amount;
    row.count += 1;
  });
  const cashIn = income + transferVolume;
  const cashOut = spending + transferVolume;
  const netCashflow = actualIncome - actualExpense;
  const activeBudgets = dashboard.period
    ? budgets.filter(budget => budget.periodId === dashboard.period?.id)
    : [];
  const totalBudget = activeBudgets.reduce((sum, budget) => sum + budget.allocated, 0);
  const usedBudget = activeBudgets.reduce((sum, budget) => sum + budget.spent, 0);
  const remainingBudget = totalBudget - usedBudget;
  const budgetUsage = totalBudget ? Math.round((usedBudget / totalBudget) * 100) : 0;

  const selectedRangeDays = calendarDays(rangeStart, rangeEnd);
  const dailyAverage = Math.round(actualExpense / selectedRangeDays);

  // ===== Rentang sebelumnya, panjangnya persis sama =====
  // Pembanding harus sepanjang rentang aktif, bukan "bulan lalu": rentang 7 hari yang
  // dibandingkan dengan sebulan penuh akan selalu terlihat membaik drastis.
  const previousRangeStart = addDays(rangeStart, -selectedRangeDays);
  const previousTransactions = allTransactions.filter((transaction) => {
    const at = new Date(transaction.date);
    return !transaction.adjustment && at >= previousRangeStart && at < rangeStart;
  });
  const previousExpenses = previousTransactions.filter(item => item.type === 'expense');
  const previousTransfers = previousTransactions.filter(item => item.type === 'transfer');
  const previousTransferVolume = previousTransfers.reduce((sum, item) => sum + item.amount, 0);
  const previousIncomeTotal = previousTransactions.filter(isIncome)
    .reduce((sum, item) => sum + item.amount, 0);
  const previousActualIncomeTotal = previousTransactions
    .filter(isActualIncome)
    .reduce((sum, item) => sum + item.amount, 0);
  const previousSpending = previousExpenses.reduce((sum, item) => sum + item.amount, 0);
  const previousActualExpense = previousExpenses.reduce(
    (sum, item) => sum + actualExpenseAmount(item), 0,
  );
  const previousCashIn = previousIncomeTotal + previousTransferVolume;
  const previousCashOut = previousSpending + previousTransferVolume;
  const previousNet = previousActualIncomeTotal - previousActualExpense;
  const deltaPercent = (current: number, previous: number) =>
    previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
  const formatDelta = (value: number | null) => value == null
    ? t('reports.newCategory')
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString(locale, {
        maximumFractionDigits: 0,
      })}%`;

  // ===== Kesehatan arus kas =====
  const savingsRate = actualIncome > 0 ? Math.round((netCashflow / actualIncome) * 100) : null;
  const runway = runwayDays(dashboard.liquidity, dailyAverage);
  const freeDays = noSpendDays(expenses, rangeStart, rangeEnd);
  const freeStreak = longestNoSpendStreak(expenses, rangeStart, rangeEnd);

  // ===== Pola hari dalam seminggu =====
  // Hanya belanja berpola kebiasaan yang dihitung — lihat isHabitualExpense untuk
  // alasannya. Yang dibuang tetap dilaporkan angkanya supaya angkanya tidak misterius.
  const weekdayBudgetOptions = budgets
    .filter(budget => expenses.some(transaction => transaction.budgetId === budget.id))
    .sort((a, b) => a.category.localeCompare(b.category, locale));
  const selectedWeekdayBudgetId = weekdayScope.startsWith('budget:')
    ? weekdayScope.slice('budget:'.length)
    : null;
  const weekdayExpenses = weekdayScope === 'unbudgeted'
    ? expenses.filter(transaction => !transaction.budgetId)
    : selectedWeekdayBudgetId
      ? expenses.filter(transaction => transaction.budgetId === selectedWeekdayBudgetId)
      : expenses.filter(isHabitualExpense);
  const excludedExpenses = weekdayScope === 'all'
    ? expenses.filter(transaction => !isHabitualExpense(transaction))
    : [];
  const excludedTotal = excludedExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const weekdays = weekdayPattern(weekdayExpenses, rangeStart, rangeEnd);
  const weekdayPeak = Math.max(...weekdays.map(entry => entry.total), 1);
  // Yang disyaratkan hanya harinya pernah muncul di rentang. Belanja nol BUKAN alasan
  // untuk dikeluarkan dari peringkat — hari yang tiga kali muncul tanpa sekali pun belanja
  // justru jawaban paling benar untuk "hari paling hemat"; menyaringnya membuat kartu itu
  // menunjuk hari lain sementara grafik di atasnya jelas-jelas menampilkan Rp 0.
  const measuredWeekdays = weekdays.filter(entry => entry.occurrences > 0);
  const priciestWeekday = [...measuredWeekdays].sort((a, b) => b.total - a.total)[0];
  const leanestWeekday = [...measuredWeekdays].sort((a, b) => a.total - b.total)[0];
  const weekendDays = weekdays.filter(entry => entry.weekday === 0 || entry.weekday === 6);
  const workDays = weekdays.filter(entry => entry.weekday > 0 && entry.weekday < 6);
  const averageOf = (entries: typeof weekdays) => {
    const occurrences = entries.reduce((sum, entry) => sum + entry.occurrences, 0);
    const total = entries.reduce((sum, entry) => sum + entry.total, 0);
    return occurrences > 0 ? Math.round(total / occurrences) : 0;
  };
  const weekendAverage = averageOf(weekendDays);
  const workdayAverage = averageOf(workDays);
  const weekendGap = deltaPercent(weekendAverage, workdayAverage);

  // ===== Kategori bertingkat =====
  const expenseFlow = flow === 'expense' || flow === 'actualExpense';
  const flowTransactions = flow === 'expense'
    ? expenses
    : flow === 'actualExpense'
      ? actualExpenseTransactions
      : flow === 'actualIncome' ? actualIncomeTransactions : incomeTransactions;
  const flowTotal = flow === 'expense'
    ? spending
    : flow === 'actualExpense'
      ? actualExpense
      : flow === 'actualIncome' ? actualIncome : income;
  const sectors = categoryTree(flowTransactions, t('reports.uncategorized'));
  const previousSectorTotals = new Map<string, number>();
  previousTransactions
    .filter(transaction => flow === 'income'
      ? isIncome(transaction)
      : flow === 'actualIncome'
        ? isActualIncome(transaction)
        : flow === 'actualExpense' ? isActualExpense(transaction) : transaction.type === 'expense')
    .forEach((transaction) => {
      const sector = transactionPath(transaction)[0] ?? t('reports.uncategorized');
      const amount = flow === 'actualExpense' ? actualExpenseAmount(transaction) : transaction.amount;
      previousSectorTotals.set(sector, (previousSectorTotals.get(sector) ?? 0) + amount);
    });
  const activeCategoryCount = new Set(
    flowTransactions.map(transaction => transactionPath(transaction).join('›')),
  ).size;
  const topSector = sectors[0];
  const shownSectorTotal = sectors.slice(0, 8).reduce((sum, sector) => sum + sector.total, 0);
  const otherSectorTotal = Math.max(0, flowTotal - shownSectorTotal);

  // Tetap dipakai untuk insight “hari terboros”, tanpa menampilkan tabel laporan harian.
  // ===== Sebaran nominal =====
  const creditWallets = dashboard.wallets.filter(wallet => wallet.kind === 'credit');
  const creditWalletNames = creditWallets.map(wallet => wallet.name).join(', ');
  const creditWalletIds = new Set(creditWallets.map(wallet => wallet.id));
  // Khusus insight periode ini, tagihan bulan depan dibentuk dari seluruh transaksi
  // yang terjadi pada kartu kredit di rentang laporan—bukan dari persentase pengeluaran.
  const creditExpenses = expenses.filter(transaction => creditWalletIds.has(transaction.walletId));
  const creditBillFromPeriod = creditExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const creditPayments = transfers.filter(transaction =>
    !!transaction.toWalletId && creditWalletIds.has(transaction.toWalletId),
  );
  const creditPaymentsTotal = creditPayments.reduce((sum, transaction) => sum + transaction.amount, 0);
  const creditBillNextMonth = creditWallets.reduce((sum, wallet) => sum + Math.max(0, wallet.balance), 0);
  const creditAdjustmentDelta = allTransactions
    .filter(transaction => transaction.adjustment
      && inSelectedRange(transaction)
      && creditWalletIds.has(transaction.walletId))
    .reduce((sum, transaction) => sum + (transaction.type === 'income' ? transaction.amount : -transaction.amount), 0);
  const creditBillPreviousPeriod = Math.max(
    0,
    creditBillNextMonth - creditBillFromPeriod + creditPaymentsTotal - creditAdjustmentDelta,
  );
  const totalCreditLimit = creditWallets.reduce((sum, wallet) => sum + (wallet.creditLimit ?? 0), 0);
  const creditLimitRemaining = creditWallets.reduce(
    (sum, wallet) => sum + Math.max(0, (wallet.creditLimit ?? 0) - Math.max(0, wallet.balance)),
    0,
  );
  const installments = creditExpenses.filter(transaction => transaction.installmentTenorMonths);
  const installmentSpending = installments.reduce((sum, transaction) => sum + transaction.amount, 0);

  const walletNames = new Map(dashboard.wallets.map(wallet => [wallet.id, wallet.name]));
  const budgetNames = new Map(budgets.map(budget => [budget.id, budget.category]));

  // ===== Sumber dana =====
  const walletSlices = groupBy(expenses, transaction => transaction.walletId).slice(0, 8);
  const walletPeak = Math.max(...walletSlices.map(slice => slice.total), 1);

  // ===== Realisasi anggaran & proyeksi =====
  const budgetRows = [...activeBudgets].sort((a, b) => b.spent - a.spent);
  const progress = range === 'activePeriod' ? dashboard.progress : null;
  const projected = progress && progress.dayOf > 0 && progress.dayOf < progress.totalDays
    ? projectedSpending(spending, progress.dayOf, progress.totalDays)
    : null;

  // Saldo historis direkonstruksi dari likuiditas saat ini dengan membalik delta kas.
  // Expense kartu kredit tetap -amount; pembayaran kartunya transfer, sehingga delta 0.
  const trendTransactions = allTransactions.filter(inSelectedRange);
  const futureCashDelta = allTransactions
    .filter(transaction => new Date(transaction.date) >= rangeEndExclusive)
    .reduce((sum, transaction) => sum + cashDelta(transaction), 0);
  const endBalance = dashboard.liquidity - futureCashDelta;
  const openingBalance = endBalance
    - trendTransactions.reduce((sum, transaction) => sum + cashDelta(transaction), 0);
  const trendBuckets = trendBucketsFor(range, rangeStart, rangeEnd, locale);
  const monthlyTrend = range === '3months' || range === '6months';
  const bucketDeltas = new Map(trendBuckets.map(bucket => [bucket.key, 0]));
  trendTransactions.forEach((transaction) => {
    const key = monthlyTrend ? monthKey(transaction.date) : dayKey(transaction.date);
    if (!bucketDeltas.has(key)) return;
    bucketDeltas.set(key, (bucketDeltas.get(key) ?? 0) + cashDelta(transaction));
  });
  let runningBalance = openingBalance;
  const trendBalances = [
    openingBalance,
    ...trendBuckets.map((bucket) => {
      runningBalance += bucketDeltas.get(bucket.key) ?? 0;
      return runningBalance;
    }),
  ];
  const trendChange = endBalance - openingBalance;
  const trendPercent = openingBalance === 0
    ? null
    : (trendChange / Math.abs(openingBalance)) * 100;
  const trendSummary = trendPercent == null
    ? money.fmtCompactSigned(trendChange)
    : `${trendPercent > 0 ? '+' : trendPercent < 0 ? '−' : ''}${Math.abs(trendPercent).toLocaleString(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`;
  const chartTone = trendChange < 0 ? 'negative' : trendChange === 0 ? 'neutral' : 'positive';
  const chartColor = trendChange < 0 ? '#EF8676' : trendChange === 0 ? '#8AB6F9' : '#5BE9AA';
  const chartTop = 20;
  const chartBottom = 168;
  const rawMin = Math.min(...trendBalances);
  const rawMax = Math.max(...trendBalances);
  const rawSpan = rawMax - rawMin;
  const chartPadding = rawSpan > 0
    ? rawSpan * 0.14
    : Math.max(Math.abs(rawMax) * 0.06, 1);
  const chartMin = rawMin - chartPadding;
  const chartMax = rawMax + chartPadding;
  const chartSpan = Math.max(1, chartMax - chartMin);
  const chartPoints = trendBalances.map((balance, index) => {
    const x = trendBalances.length === 1 ? 320 : (index / (trendBalances.length - 1)) * 640;
    const y = chartTop + ((chartMax - balance) / chartSpan) * (chartBottom - chartTop);
    return { x, y };
  });
  const linePath = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
  const areaPath = `${linePath} L640,190 L0,190 Z`;
  const lastChartPoint = chartPoints.at(-1) ?? { x: 640, y: chartBottom };
  const axisLabels = sampledAxisLabels(trendBuckets);
  const safeHoveredChartIndex = hoveredChartIndex == null
    ? null
    : Math.min(hoveredChartIndex, chartPoints.length - 1);
  const hoveredChartPoint = safeHoveredChartIndex == null
    ? null
    : chartPoints[safeHoveredChartIndex];
  const hoveredChartBalance = safeHoveredChartIndex == null
    ? null
    : trendBalances[safeHoveredChartIndex];
  const hoveredChartLabel = safeHoveredChartIndex === 0
    ? t('reports.chartOpeningBalance')
    : trendBuckets[(safeHoveredChartIndex ?? 1) - 1]?.label ?? '';
  const pickChartPoint = (clientX: number, bounds: DOMRect) => {
    if (!bounds.width || chartPoints.length === 0) return;
    const position = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    setHoveredChartIndex(Math.round(position * (chartPoints.length - 1)));
  };

  const rangeOptions: Array<[Range, string]> = [
    ['daily', t('reports.daily')],
    [
      'activePeriod',
      dashboard.period ? t('reports.activePeriod') : t('reports.thisMonth'),
    ],
    ['3months', t('reports.3months')],
    ['6months', t('reports.6months')],
  ];
  const selectedRangeLabel = range === 'activePeriod' && dashboard.period
    ? dashboard.period.alias
    : rangeOptions.find(([value]) => value === range)?.[1] ?? '';

  const exportCsv = () => {
    const rows = [
      [
        'Tanggal',
        'Hari',
        'Jenis',
        'Klasifikasi pemasukan',
        'Klasifikasi pengeluaran',
        'Pemanfaatan pengeluaran',
        'Sifat',
        'Catatan',
        'Tempat',
        'Kelompok besar',
        'Kategori',
        'Spesifik',
        'Dompet sumber',
        'Dompet tujuan',
        'Anggaran',
        'Tenor cicilan (bulan)',
        'Cicilan yang sudah lunas',
        'Jumlah',
        'Dampak saldo',
        'Dampak arus kas riil',
      ],
      ...transactions.map((transaction) => {
        const path = transaction.labels[0] ? categoryPath(transaction.labels[0]) : [];
        const at = new Date(transaction.date);
        return [
          at.toLocaleDateString('id-ID'),
          weekdayLabel(at.getDay(), 'id-ID', true),
          transaction.type,
          transaction.type === 'income'
            ? isActualIncome(transaction) ? 'Pemasukan riil' : 'Pelunasan piutang'
            : '',
          transaction.type === 'expense'
            ? actualExpenseAmount(transaction) > 0 ? 'Pengeluaran riil' : 'Pembentukan piutang'
            : transaction.type === 'transfer' ? 'Transfer' : '',
          transaction.type === 'expense' && !transaction.isReceivable
            ? benefitScopeOf(transaction) === 'shared'
              ? 'Dipakai bersama'
              : benefitScopeOf(transaction) === 'other' ? 'Untuk orang lain' : 'Diri sendiri sepenuhnya'
            : '',
          transaction.nature === 'unexpected' ? 'tak terduga' : 'terencana',
          transaction.note || '',
          transaction.merchant || '',
          path[0] || '',
          path[1] || '',
          path[2] || '',
          walletNames.get(transaction.walletId) || '',
          transaction.toWalletId ? walletNames.get(transaction.toWalletId) || '' : '',
          transaction.budgetId ? budgetNames.get(transaction.budgetId) || '' : '',
          transaction.installmentTenorMonths ? String(transaction.installmentTenorMonths) : '',
          transaction.installmentTenorMonths ? String(transaction.installmentPaidMonths ?? 0) : '',
          String(transaction.amount),
          String(cashDelta(transaction)),
          String(realCashflowDelta(transaction)),
        ];
      }),
    ];
    const csv = rows
      .map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `laporan-keuangan-${dayKey(rangeStart)}-${dayKey(rangeEnd)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    ui.notify(t('reports.exported'));
  };

  return (
    <>
      <div className="report-actions">
        <div className="filter-pills report-range">
          {rangeOptions.map(([value, label]) => (
            <button key={value} className={range === value ? 'on' : ''} onClick={() => setRange(value)}>
              {label}
            </button>
          ))}
        </div>
        <button className="addg" onClick={exportCsv}><Download />{t('reports.export')}</button>
      </div>

      <section className={`report-executive${dashboard.safeToSpend < 0 ? ' deficit' : ''}`}>
        <div className="report-executive-main">
          <div>
            <span>{t('reports.freeCashflow')}</span>
            <b>{money.fmtCompactSigned(dashboard.safeToSpend)}</b>
            <small>{t('reports.currentFinancialPosition')}</small>
          </div>
          <span className="report-executive-status">
            {t(dashboard.safeToSpend >= 0 ? 'reports.surplus' : 'reports.deficit')}
          </span>
        </div>
        <div className="report-executive-formula">
          <div><span>{t('reports.assetBalance')}</span><b>{money.fmtCompactSigned(dashboard.assets)}</b></div>
          <i>−</i>
          <div><span>{t('reports.previousCreditDue')}</span><b className="negative">−{money.fmtCompact(dashboard.previousPeriodCreditDue)}</b></div>
          <i>−</i>
          <div>
            <span>{t('reports.currentCreditDue')}</span>
            <b className="negative">−{money.fmtCompact(dashboard.currentPeriodCreditDue)}</b>
            <small>{t('reports.currentCreditSpendingRecorded', {
              amount: money.fmtCompact(dashboard.currentPeriodCreditSpending),
            })}</small>
          </div>
          <i>−</i>
          <div><span>{t('planning.lockedSavings')}</span><b className="negative">−{money.fmtCompact(dashboard.reserved)}</b></div>
          <i>−</i>
          <div><span>{t('planning.remainingBudget')}</span><b className="negative">−{money.fmtCompact(dashboard.allocated)}</b></div>
          <i>=</i>
          <div><span>{t('reports.freeCashflow')}</span><b className={dashboard.safeToSpend >= 0 ? 'positive' : 'negative'}>{money.fmtCompactSigned(dashboard.safeToSpend)}</b></div>
        </div>
      </section>

      <section className="report-metric-section report-real-flow">
        <div className="report-metric-heading">
          <div>
            <span>{t('reports.realFlowSummary')}</span>
            <small>{selectedRangeLabel}</small>
          </div>
          <p>{t('reports.realDefinition')}</p>
        </div>
        <div className="metric-grid report-metrics report-real-metrics">
          <div className="metric-card m-real-in">
            <span>{t('reports.actualIncome')}</span>
            <b>{money.fmtCompact(actualIncome)}</b>
            <small>{actualIncomeTransactions.length} {t('reports.txCount')}</small>
          </div>
          <div className="metric-card m-real-out">
            <span>{t('reports.actualExpense')}</span>
            <b>{money.fmtCompact(actualExpense)}</b>
            <small>{actualExpenseTransactions.length} {t('reports.txCount')}</small>
          </div>
          <div className={`metric-card m-net${netCashflow < 0 ? ' negative-net' : ''}`}>
            <span>{t('reports.realNet')}</span>
            <b>{money.fmtCompactSigned(netCashflow)}</b>
            <small>{t('reports.actualIncomeMinusExpense')}</small>
          </div>
        </div>
      </section>

      <section className="report-metric-section report-benefit-summary">
        <div className="report-metric-heading">
          <div>
            <span>{t('reports.benefitSummary')}</span>
            <small>{selectedRangeLabel}</small>
          </div>
          <p>{t('reports.benefitSummaryLead')}</p>
        </div>
        {expenses.length === 0 ? (
          <div className="saving-empty">{t('reports.benefitNoExpense')}</div>
        ) : (
          <div className="benefit-card">
            <div className="benefit-total">
              <span>{t('reports.benefitRecordedTotal')}</span>
              <b>{money.fmtCompact(spending)}</b>
            </div>
            <div className="benefit-stack" aria-label={t('reports.benefitSummary')}>
              {benefitRows.filter((row) => row.total > 0).map((row) => (
                <i key={row.scope} style={{ width: `${(row.total / spending) * 100}%`, background: row.color }} />
              ))}
            </div>
            <div className="benefit-rows">
              {benefitRows.map((row) => {
                const share = spending ? Math.round((row.total / spending) * 100) : 0;
                return (
                  <div className="benefit-row" key={row.scope}>
                    <span><i style={{ background: row.color }} />{row.label}</span>
                    <b>{money.fmtCompact(row.total)}</b>
                    <small>{row.count} {t('reports.txCount')} · {share}% {t('reports.ofSpending')}</small>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div className="report-secondary-summary">
        <section className="report-metric-section report-secondary-flow">
          <div className="report-metric-heading compact">
            <div>
              <span>{t('reports.recordedFlow')}</span>
              <small>{selectedRangeLabel}</small>
            </div>
            <p>{t('reports.grossFlowDefinition')}</p>
          </div>
          <div className="metric-grid report-metrics report-secondary-metrics">
            <div className="metric-card m-in">
              <span>{t('reports.income')}</span>
              <b>{money.fmtCompact(cashIn)}</b>
              <small>{t('reports.grossIncomeNote')}</small>
            </div>
            <div className="metric-card m-out">
              <span>{t('reports.expense')}</span>
              <b>{money.fmtCompact(cashOut)}</b>
              <small>{t('reports.grossExpenseNote')}</small>
            </div>
          </div>
        </section>

        <section className="report-metric-section report-budget-summary">
          <div className={`metric-card m-budget${remainingBudget < 0 ? ' over' : ''}`}>
            <span>{t('reports.totalBudget')}</span>
            <b>{money.fmtCompact(totalBudget)}</b>
            <small>
              {totalBudget
                ? t('reports.budgetUsage', {
                    percent: budgetUsage,
                    remaining: money.fmtCompactSigned(remainingBudget),
                  })
                : t('reports.noActiveBudget')}
            </small>
          </div>
        </section>
      </div>

      {/* ===== Kesehatan arus kas ===== */}
      <div className="sec">
        <span className="t">{t('reports.cashflowHealth')}</span>
        <span className="daily-avg">{selectedRangeLabel.toLowerCase()}</span>
      </div>
      <div className="health-card">
        <div className="health-grid">
          <div className={savingsRate != null && savingsRate < 0 ? 'negative' : ''}>
            <span>{t('reports.savingsRate')}</span>
            <b>{savingsRate == null ? '—' : `${savingsRate}%`}</b>
            <small>{t('reports.savingsRateNote')}</small>
          </div>
          <div>
            <span>{t('reports.dailyBurn')}</span>
            <b>{money.fmtCompact(dailyAverage)}</b>
            <small>{t('reports.dailyBurnNote', { days: selectedRangeDays })}</small>
          </div>
          <div>
            <span>{t('reports.runway')}</span>
            <b>{runway == null ? t('reports.runwayUnknown') : t('reports.runwayValue', { days: runway })}</b>
            <small>{t('reports.runwayNote')}</small>
          </div>
          <div>
            <span>{t('reports.noSpendDays')}</span>
            <b>{freeDays}/{selectedRangeDays}</b>
            <small>{t('reports.noSpendNote', { days: freeStreak })}</small>
          </div>
        </div>
        <div className="compare-strip">
          <span className="compare-title">{t('reports.vsPrevious')}</span>
          <div className="compare-items">
            {([
              [t('reports.income'), cashIn, previousCashIn, true, false],
              [t('reports.actualIncome'), actualIncome, previousActualIncomeTotal, true, false],
              [t('reports.expense'), cashOut, previousCashOut, false, false],
              [t('reports.actualExpense'), actualExpense, previousActualExpense, false, false],
              // Arus kas bersih boleh negatif, jadi tandanya harus ikut tercetak —
              // dua sisanya selalu ≥ 0 dan tidak perlu diberi tanda plus.
              [t('reports.netCashflow'), netCashflow, previousNet, true, true],
            ] as Array<[string, number, number, boolean, boolean]>)
              .map(([label, current, previous, higherIsBetter, signed]) => {
                const change = deltaPercent(current, previous);
                // Naiknya pengeluaran bukan kabar baik, naiknya pemasukan iya — kelas
                // warnanya mengikuti maknanya, bukan arah angkanya.
                const tone = change == null || change === 0
                  ? 'flat'
                  : (change > 0) === higherIsBetter ? 'down' : 'up';
                const show = (value: number) =>
                  signed ? money.fmtCompactSigned(value) : money.fmtCompact(value);
                return (
                  <div className="compare-item" key={label}>
                    <span>{label}</span>
                    <div className="compare-value">
                      <b>{show(current)}</b>
                      <em className={tone}>{formatDelta(change)}</em>
                    </div>
                    <small>{t('reports.previousValue', { amount: show(previous) })}</small>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="sec">
        <span className="t">{t('reports.balanceTrend')} · {selectedRangeLabel.toLowerCase()}</span>
      </div>
      <div className="chart-card">
        <div className="ct">
          <div>
            <div className="cv">{money.fmtCompactSigned(endBalance)}</div>
            <span className="chart-caption">{t('reports.rangeEndBalance')}</span>
          </div>
          <div className={`cd ${chartTone}`}><TrendUp />{trendSummary}</div>
        </div>
        <div className="chart">
          {hoveredChartPoint && hoveredChartBalance != null && (
            <div
              className={`chart-tooltip${safeHoveredChartIndex === 0 ? ' at-start' : safeHoveredChartIndex === chartPoints.length - 1 ? ' at-end' : ''}`}
              style={{ left: `${(hoveredChartPoint.x / 640) * 100}%`, top: `${(hoveredChartPoint.y / 190) * 100}%` }}
              role="status"
            >
              <span>{hoveredChartLabel}</span>
              <b>{money.fmtSigned(hoveredChartBalance)}</b>
            </div>
          )}
          <svg
            viewBox="0 0 640 190"
            preserveAspectRatio="none"
            role="img"
            onPointerMove={(event) => pickChartPoint(event.clientX, event.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setHoveredChartIndex(null)}
            onPointerDown={(event) => pickChartPoint(event.clientX, event.currentTarget.getBoundingClientRect())}
            aria-label={`${t('reports.balanceTrend')}: ${money.fmtSigned(openingBalance)} → ${money.fmtSigned(endBalance)}`}
          >
            <defs>
              <linearGradient id="balance-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={chartColor} stopOpacity=".38" />
                <stop offset="1" stopColor={chartColor} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[35, 75, 115, 155].map(y => (
              <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="var(--line)" />
            ))}
            <path d={areaPath} fill="url(#balance-area)" />
            <path
              d={linePath}
              fill="none"
              stroke={chartColor}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={lastChartPoint.x} cy={lastChartPoint.y} r="6" fill={chartColor} />
            {hoveredChartPoint && (
              <g className="chart-hover-point">
                <line x1={hoveredChartPoint.x} y1="20" x2={hoveredChartPoint.x} y2="170" />
                <circle cx={hoveredChartPoint.x} cy={hoveredChartPoint.y} r="6" fill="var(--surface)" stroke={chartColor} strokeWidth="3" />
              </g>
            )}
          </svg>
        </div>
        <div className="chart-axis">
          {axisLabels.map(label => <span key={label.key}>{label.label}</span>)}
        </div>
      </div>

      {/* ===== Pola hari dalam seminggu ===== */}
      <div className="sec">
        <span className="t">{t('reports.weekdayPattern')}</span>
        <label className="weekday-filter">
          <span>{t('reports.weekdayFilterLabel')}</span>
          <span className="weekday-select-wrap">
            <select
              value={weekdayScope}
              onChange={(event) => {
                setWeekdayScope(event.target.value);
                setOpenWeekday(null);
              }}
            >
              <option value="all">{t('reports.weekdayFilterAll')}</option>
              <option value="unbudgeted">{t('reports.weekdayFilterUnbudgeted')}</option>
              {weekdayBudgetOptions.map(budget => (
                <option value={`budget:${budget.id}`} key={budget.id}>
                  {t('reports.weekdayFilterBudget', { name: budget.category })}
                </option>
              ))}
            </select>
            <Chevron />
          </span>
        </label>
      </div>
      <div className="weekday-card">
        {weekdayExpenses.length === 0 ? (
          <div className="saving-empty">{t('reports.noData')}</div>
        ) : (
          <>
            <div className="weekday-rows">
              {weekdays.map((entry) => {
                const peak = priciestWeekday?.weekday === entry.weekday;
                const isOpen = openWeekday === entry.weekday;
                const dayTransactions = weekdayExpenses
                  .filter(transaction => new Date(transaction.date).getDay() === entry.weekday)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                return (
                  <div className={`weekday-group${peak ? ' peak' : ''}${isOpen ? ' open' : ''}`} key={entry.weekday}>
                    <button
                      type="button"
                      className="weekday-row"
                      onClick={() => setOpenWeekday(isOpen ? null : entry.weekday)}
                      aria-expanded={isOpen}
                    >
                      <span className="weekday-name">{weekdayLabel(entry.weekday, locale)}</span>
                      <span className="weekday-bar">
                        {/* Nol tidak boleh menyisakan isi apa pun: min-width pada .weekday-bar i
                            membuat 0 tetap tampil sebagai secuil garis, dan itu membantah
                            angka "Rp 0" di sebelahnya. */}
                        {entry.total > 0 && (
                          <i style={{ width: `${(entry.total / weekdayPeak) * 100}%` }} />
                        )}
                      </span>
                      <span className="weekday-value">{money.fmtCompact(entry.total)}</span>
                      <span className="weekday-count">
                        {t('reports.weekdayTransactionAverage', {
                          count: entry.count,
                          amount: money.fmt(entry.count ? Math.round(entry.total / entry.count) : 0),
                        })}
                      </span>
                      <Chevron className="weekday-caret" />
                    </button>
                    {isOpen && (
                      <div className="weekday-details budget-transactions">
                        {dayTransactions.length === 0 ? (
                          <span className="budget-transactions-empty">{t('reports.noData')}</span>
                        ) : dayTransactions.map((transaction) => {
                          const date = new Date(transaction.date);
                          const category = transactionPath(transaction).at(-1) ?? t('reports.uncategorized');
                          const name = transaction.merchant || transaction.note || category;
                          return (
                            <button
                              type="button"
                              className="budget-transaction"
                              key={transaction.id}
                              onClick={() => ui.openItem(name, 'transaksi', transaction.id)}
                            >
                              <span>
                                <b>{name}</b>
                                <small>{date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })} · {category}</small>
                              </span>
                              <b className="negative">−{money.fmt(transaction.amount)}</b>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="weekday-summary">
              <div>
                <span>{t('reports.priciestWeekday')}</span>
                <b>{priciestWeekday ? weekdayLabel(priciestWeekday.weekday, locale, true) : '—'}</b>
                <small>{money.fmtCompact(priciestWeekday?.total ?? 0)}</small>
              </div>
              <div>
                <span>{t('reports.leanestWeekday')}</span>
                <b>{leanestWeekday ? weekdayLabel(leanestWeekday.weekday, locale, true) : '—'}</b>
                <small>{money.fmtCompact(leanestWeekday?.total ?? 0)}</small>
              </div>
              <div>
                <span>{t('reports.weekendGap')}</span>
                <b>{formatDelta(weekendGap)}</b>
                <small>{money.fmtCompact(weekendAverage)} vs {money.fmtCompact(workdayAverage)}</small>
              </div>
            </div>
          </>
        )}
        {excludedExpenses.length > 0 && (
          <div className="weekday-note">
            {t('reports.weekdayExcluded', {
              count: excludedExpenses.length,
              amount: money.fmtCompact(excludedTotal),
            })}
          </div>
        )}
      </div>

      {/* ===== Kategori bertingkat ===== */}
      <div className="sec">
        <span className="t">{t('reports.sectorBreakdown')}</span>
        <span className="daily-avg">{t('reports.sectorHint')}</span>
      </div>
      <div className="filter-pills sub-filter flow-toggle">
        {([['expense', t('reports.expense')], ['actualExpense', t('reports.actualExpense')], ['income', t('reports.income')], ['actualIncome', t('reports.actualIncome')]] as Array<[Flow, string]>)
          .map(([value, label]) => (
            <button
              key={value}
              className={flow === value ? 'on' : ''}
              onClick={() => { setFlow(value); setOpenSector(null); }}
            >
              {label}
              <span className="pill-count">
                {value === 'expense'
                  ? expenses.length
                  : value === 'actualExpense'
                    ? actualExpenseTransactions.length
                    : value === 'actualIncome' ? actualIncomeTransactions.length : incomeTransactions.length}
              </span>
            </button>
          ))}
      </div>
      <div className="category-report-card">
        {sectors.length === 0 ? (
          <div className="saving-empty">
            {expenseFlow ? t('reports.noData') : t('reports.noIncomeData')}
          </div>
        ) : (
          <>
            <div className="category-report-overview">
              <div>
                <span>{t('reports.largestCategory')}</span>
                <b>{topSector.name}</b>
                <small>
                  {money.fmtCompact(topSector.total)} · {flowTotal
                    ? Math.round((topSector.total / flowTotal) * 100)
                    : 0}%
                </small>
              </div>
              <div>
                <span>{t('reports.activeCategories')}</span>
                <b>{activeCategoryCount}</b>
                <small>{flowTransactions.length} {t('reports.txCount')}</small>
              </div>
            </div>
            <div className="category-distribution" aria-label={t('reports.categoryDistribution')}>
              {sectors.slice(0, 8).map((sector, index) => (
                <i
                  key={sector.name}
                  style={{
                    width: `${flowTotal ? (sector.total / flowTotal) * 100 : 0}%`,
                    background: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                  }}
                  title={`${sector.name}: ${money.fmt(sector.total)}`}
                />
              ))}
              {otherSectorTotal > 0 && (
                <i
                  className="other"
                  style={{ width: `${(otherSectorTotal / flowTotal) * 100}%` }}
                  title={`${t('reports.otherCategories')}: ${money.fmt(otherSectorTotal)}`}
                />
              )}
            </div>
            <div className="sector-list">
              {sectors.map((sector, index) => {
                const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
                const share = flowTotal ? Math.round((sector.total / flowTotal) * 100) : 0;
                const change = deltaPercent(sector.total, previousSectorTotals.get(sector.name) ?? 0);
                // Untuk pengeluaran, naik itu buruk; untuk pemasukan sebaliknya.
                const tone = change == null
                  ? 'new'
                  : change === 0
                    ? 'flat'
                    : (change > 0) === !expenseFlow ? 'down' : 'up';
                const sectorTransactions = flowTransactions
                  .filter(transaction => (transactionPath(transaction)[0] ?? t('reports.uncategorized')) === sector.name)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                // Piutang tidak memiliki turunan kategori, tetapi detail transaksinya
                // tetap perlu dapat dibuka agar nominal totalnya bisa ditelusuri.
                const expandable = sector.children.length > 0 || sectorTransactions.length > 0;
                const open = expandable && openSector === sector.name;
                return (
                  <div className={`sector${open ? ' open' : ''}`} key={sector.name}>
                    <button
                      type="button"
                      className="sector-head"
                      aria-expanded={expandable ? open : undefined}
                      onClick={() => expandable && setOpenSector(open ? null : sector.name)}
                    >
                      <span className="category-rank" style={{ background: color }}>{index + 1}</span>
                      <span className="sector-main">
                        <span className="category-report-head">
                          <b>{sector.name}</b>
                          <strong>{money.fmt(sector.total)}</strong>
                        </span>
                        <span className="category-report-meta">
                          <span>{share}% {expenseFlow ? t('reports.ofSpending') : t('reports.ofIncome')}</span>
                          <span>{sector.count} {t('reports.txCount')}</span>
                          {sector.children.length > 0 && (
                            <span>{t('reports.subcategoryCount', { count: sector.children.length })}</span>
                          )}
                          <em className={tone}>{formatDelta(change)}</em>
                        </span>
                        <span className="category-share-bar">
                          <i style={{ width: `${share}%`, background: color }} />
                        </span>
                      </span>
                      {expandable && <Chevron className="sector-caret" />}
                    </button>
                    {open && sector.children.length > 0 && (
                      <div className="sector-children">
                        {sector.children.map((child) => {
                          const childShare = sector.total
                            ? Math.round((child.total / sector.total) * 100)
                            : 0;
                          return (
                            <div className="sector-child" key={child.name}>
                              <div className="sector-child-head">
                                <b>{child.name}</b>
                                <span>{money.fmtCompact(child.total)}</span>
                                <em>{childShare}%</em>
                              </div>
                              <div className="sector-child-bar">
                                <i style={{ width: `${childShare}%`, background: color }} />
                              </div>
                              <div className="sector-child-meta">
                                {child.count} {t('reports.txCount')} · {t('reports.avgShort')}{' '}
                                {money.fmtCompact(Math.round(child.total / child.count))} · {childShare}%{' '}
                                {t('reports.ofSector')}
                              </div>
                              {child.children.length > 0 && (
                                <div className="sector-leaves">
                                  {child.children.map(leaf => (
                                    <span key={leaf.name}>
                                      {leaf.name}
                                      <b>{money.fmtCompact(leaf.total)}</b>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {open && sector.children.length === 0 && (
                      <div className="sector-transactions budget-transactions">
                        {sectorTransactions.map((transaction) => {
                          const category = transactionPath(transaction).at(-1) ?? t('reports.uncategorized');
                          const name = transaction.merchant || transaction.note || category;
                          return (
                            <button
                              type="button"
                              className="budget-transaction"
                              key={transaction.id}
                              onClick={() => ui.openItem(name, 'transaksi', transaction.id)}
                            >
                              <span>
                                <b>{name}</b>
                                <small>
                                  {new Date(transaction.date).toLocaleDateString(locale, {
                                    day: 'numeric', month: 'short', year: 'numeric',
                                  })} · {category}
                                </small>
                              </span>
                              <b className="negative">−{money.fmt(transaction.amount)}</b>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ===== Sumber dana ===== */}
      <div className="report-columns">
        <div>
          <div className="sec"><span className="t">{t('reports.walletBreakdown')}</span></div>
          <div className="breakdown-card">
            {walletSlices.length === 0 ? (
              <div className="saving-empty">{t('reports.noData')}</div>
            ) : walletSlices.map((slice) => (
              <div className="breakdown-row" key={slice.key}>
                <div className="breakdown-head">
                  <b>{walletNames.get(slice.key) ?? t('reports.uncategorized')}</b>
                  <strong>{money.fmtCompact(slice.total)}</strong>
                </div>
                <div className="breakdown-bar">
                  <i style={{ width: `${(slice.total / walletPeak) * 100}%` }} />
                </div>
                <div className="breakdown-meta">
                  {slice.count} {t('reports.txCount')} · {spending
                    ? Math.round((slice.total / spending) * 100)
                    : 0}% {t('reports.ofSpending')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Informasi kredit ===== */}
      <div className="sec"><span className="t">{t('reports.creditInsights')}</span></div>
      <div className="transaction-insight-card">
        {creditWallets.length === 0 ? (
          <div className="saving-empty">{t('reports.noCreditInsight')}</div>
        ) : (
          <>
            <div className="transaction-insight-feature">
              <span>{t('reports.creditPreviousBill')}</span>
              <div>
                <b>{t('reports.creditBillsFromCards', { wallets: creditWalletNames })}</b>
                <strong>{money.fmt(creditBillPreviousPeriod)}</strong>
              </div>
            </div>
            <div className={`transaction-insight-grid wide credit-insight-grid credit-insight-count-${4 + (creditPayments.length > 0 ? 1 : 0) + (installments.length > 0 ? 1 : 0)}`}>
              <div>
                <span>{t('reports.creditTransactionsPeriod')}</span>
                <b>{creditExpenses.length} {t('reports.txCount')}</b>
                <small>{t('reports.creditTransactionValue', { amount: money.fmtCompact(creditBillFromPeriod) })}</small>
              </div>
              <div>
                <span>{t('reports.creditBillFromPeriod')}</span>
                <b>{money.fmtCompact(creditBillFromPeriod)}</b>
                <small>{t('reports.creditBillThisMonthNote')}</small>
              </div>
              {creditPayments.length > 0 && (
                <div>
                  <span>{t('reports.creditPaymentPeriod')}</span>
                  <b>{creditPayments.length} {t('reports.txCount')}</b>
                  <small>{t('reports.creditPaymentSettlementValue', { amount: money.fmtCompact(creditPaymentsTotal) })}</small>
                </div>
              )}
              <div>
                <span>{t('reports.creditLimitRemaining')}</span>
                <b>{money.fmtCompact(creditLimitRemaining)}</b>
                <small>{t('reports.creditLimitTotal', { amount: money.fmtCompact(totalCreditLimit) })}</small>
              </div>
              <div>
                <span>{t('reports.creditCardsActive')}</span>
                <b>{creditWallets.length} {t('reports.creditCardUnit')}</b>
                <small>{t('reports.creditLimitTotal', { amount: money.fmtCompact(totalCreditLimit) })}</small>
              </div>
              {installments.length > 0 && (
                <div>
                  <span>{t('reports.creditInstallmentsPeriod')}</span>
                  <b>{installments.length} {t('reports.txCount')}</b>
                  <small>{t('reports.creditTransactionValue', { amount: money.fmtCompact(installmentSpending) })}</small>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ===== Realisasi anggaran ===== */}
      {budgetRows.length > 0 && (
        <>
          <div className="sec">
            <span className="t">{t('reports.budgetRealization')}</span>
            <span className="daily-avg">{budgetUsage}% {t('reports.ofSpending')}</span>
          </div>
          <div className="breakdown-card">
            {projected != null && (
              <div className={`projection-note${projected > totalBudget && totalBudget > 0 ? ' over' : ''}`}>
                <span>{t('reports.projection')}</span>
                <b>{money.fmtCompact(projected)}</b>
                <small>{t('reports.projectionNote')}</small>
              </div>
            )}
            {budgetRows.map((budget) => {
              const usage = budget.allocated
                ? Math.round((budget.spent / budget.allocated) * 100)
                : 0;
              return (
                <div className="breakdown-row" key={budget.id}>
                  <div className="breakdown-head">
                    <b>{budget.category}</b>
                    <strong>{money.fmtCompact(budget.spent)} / {money.fmtCompact(budget.allocated)}</strong>
                  </div>
                  <div className="breakdown-bar">
                    <i
                      className={budget.over ? 'over' : ''}
                      style={{ width: `${Math.min(100, usage)}%` }}
                    />
                  </div>
                  <div className="breakdown-meta">
                    {usage}% ·{' '}
                    {budget.over
                      ? t('reports.budgetOver', { amount: money.fmtCompact(-budget.remaining) })
                      : t('reports.budgetLeft', { amount: money.fmtCompact(budget.remaining) })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
