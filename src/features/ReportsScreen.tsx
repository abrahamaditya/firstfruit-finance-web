'use client';

import React, { useState } from 'react';
import { useBudgets, useDashboard, useTransactions } from '../application/hooks';
import { useUI, useMoney, useT } from '../components/AppShell';
import { Chevron, Download, TrendUp } from '../components/ui/icons';
import { addDays, dayKey, startOfDay } from '../core/domain/calendar';
import { categoryPath } from '../core/domain/categories';
import {
  amountStats, categoryTree, groupBy, isHabitualExpense, longestNoSpendStreak, noSpendDays,
  projectedSpending, runwayDays, transactionPath, weekdayPattern,
} from '../core/domain/report-insights';
import type { Transaction } from '../core/domain/types';

type Range = 'daily' | 'activePeriod' | '3months' | '6months';
type Flow = 'expense' | 'income';

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
  const money = useMoney();
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const { data: allTransactions } = useTransactions();
  const { budgets } = useBudgets();
  const dashboard = useDashboard();
  const [range, setRange] = useState<Range>('activePeriod');
  const [flow, setFlow] = useState<Flow>('expense');
  const [openSector, setOpenSector] = useState<string | null>(null);

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
  const incomeTransactions = transactions.filter(transaction => transaction.type === 'income');
  const transfers = transactions.filter(transaction => transaction.type === 'transfer');
  const income = incomeTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const spending = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const netCashflow = income - spending;
  const activeBudgets = dashboard.period
    ? budgets.filter(budget => budget.periodId === dashboard.period?.id)
    : [];
  const totalBudget = activeBudgets.reduce((sum, budget) => sum + budget.allocated, 0);
  const usedBudget = activeBudgets.reduce((sum, budget) => sum + budget.spent, 0);
  const remainingBudget = totalBudget - usedBudget;
  const budgetUsage = totalBudget ? Math.round((usedBudget / totalBudget) * 100) : 0;

  const selectedRangeDays = calendarDays(rangeStart, rangeEnd);
  const dailyAverage = Math.round(spending / selectedRangeDays);

  // ===== Rentang sebelumnya, panjangnya persis sama =====
  // Pembanding harus sepanjang rentang aktif, bukan "bulan lalu": rentang 7 hari yang
  // dibandingkan dengan sebulan penuh akan selalu terlihat membaik drastis.
  const previousRangeStart = addDays(rangeStart, -selectedRangeDays);
  const previousTransactions = allTransactions.filter((transaction) => {
    const at = new Date(transaction.date);
    return !transaction.adjustment && at >= previousRangeStart && at < rangeStart;
  });
  const previousExpenses = previousTransactions.filter(item => item.type === 'expense');
  const previousIncomeTotal = previousTransactions
    .filter(item => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0);
  const previousSpending = previousExpenses.reduce((sum, item) => sum + item.amount, 0);
  const previousNet = previousIncomeTotal - previousSpending;
  const deltaPercent = (current: number, previous: number) =>
    previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
  const formatDelta = (value: number | null) => value == null
    ? t('reports.newCategory')
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString(locale, {
        maximumFractionDigits: 0,
      })}%`;

  // ===== Kesehatan arus kas =====
  const savingsRate = income > 0 ? Math.round((netCashflow / income) * 100) : null;
  const runway = runwayDays(dashboard.liquidity, dailyAverage);
  const freeDays = noSpendDays(expenses, rangeStart, rangeEnd);
  const freeStreak = longestNoSpendStreak(expenses, rangeStart, rangeEnd);

  // ===== Pola hari dalam seminggu =====
  // Hanya belanja berpola kebiasaan yang dihitung — lihat isHabitualExpense untuk
  // alasannya. Yang dibuang tetap dilaporkan angkanya supaya angkanya tidak misterius.
  const habitualExpenses = expenses.filter(isHabitualExpense);
  const excludedExpenses = expenses.filter(transaction => !isHabitualExpense(transaction));
  const excludedTotal = excludedExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const weekdays = weekdayPattern(habitualExpenses, rangeStart, rangeEnd);
  const weekdayPeak = Math.max(...weekdays.map(entry => entry.average), 1);
  // Yang disyaratkan hanya harinya pernah muncul di rentang. Belanja nol BUKAN alasan
  // untuk dikeluarkan dari peringkat — hari yang tiga kali muncul tanpa sekali pun belanja
  // justru jawaban paling benar untuk "hari paling hemat"; menyaringnya membuat kartu itu
  // menunjuk hari lain sementara grafik di atasnya jelas-jelas menampilkan Rp 0.
  const measuredWeekdays = weekdays.filter(entry => entry.occurrences > 0);
  const priciestWeekday = [...measuredWeekdays].sort((a, b) => b.average - a.average)[0];
  const leanestWeekday = [...measuredWeekdays].sort((a, b) => a.average - b.average)[0];
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
  const flowTransactions = flow === 'expense' ? expenses : incomeTransactions;
  const flowTotal = flow === 'expense' ? spending : income;
  const sectors = categoryTree(flowTransactions, t('reports.uncategorized'));
  const previousSectorTotals = new Map<string, number>();
  previousTransactions
    .filter(transaction => transaction.type === flow)
    .forEach((transaction) => {
      const sector = transactionPath(transaction)[0] ?? t('reports.uncategorized');
      previousSectorTotals.set(sector, (previousSectorTotals.get(sector) ?? 0) + transaction.amount);
    });
  const activeCategoryCount = new Set(
    flowTransactions.map(transaction => transactionPath(transaction).join('›')),
  ).size;
  const topSector = sectors[0];
  const shownSectorTotal = sectors.slice(0, 8).reduce((sum, sector) => sum + sector.total, 0);
  const otherSectorTotal = Math.max(0, flowTotal - shownSectorTotal);

  // Laporan harian: satu baris per tanggal yang ada aktivitasnya, terbaru di atas.
  const dailyMap = new Map<string, { income: number; expense: number; count: number }>();
  transactions.forEach((transaction) => {
    if (transaction.type === 'transfer') return;
    const key = dayKey(transaction.date);
    const entry = dailyMap.get(key) ?? { income: 0, expense: 0, count: 0 };
    if (transaction.type === 'income') entry.income += transaction.amount;
    else entry.expense += transaction.amount;
    entry.count += 1;
    dailyMap.set(key, entry);
  });
  const daily = [...dailyMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 31);
  const dailyMax = Math.max(...daily.map(([, entry]) => Math.max(entry.income, entry.expense)), 1);

  // ===== Sebaran nominal =====
  const stats = amountStats(expenses);
  const largestExpense = expenses.find(transaction => transaction.amount === stats.largest);
  const largestExpenseLabel = largestExpense
    ? largestExpense.note
      || largestExpense.merchant
      || largestExpense.labels.at(-1)
      || t('reports.expense')
    : '';
  const busiestDay = [...dailyMap.entries()]
    .filter(([, entry]) => entry.expense > 0)
    .sort((a, b) => b[1].expense - a[1].expense)[0];
  const busiestDayLabel = busiestDay
    ? new Date(`${busiestDay[0]}T12:00:00`).toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '';
  const unexpected = expenses.filter(transaction => transaction.nature === 'unexpected');
  const unexpectedTotal = unexpected.reduce((sum, transaction) => sum + transaction.amount, 0);
  const unexpectedPercent = spending ? Math.round((unexpectedTotal / spending) * 100) : 0;
  const savingsMoved = transfers
    .filter(transaction => transaction.savingId)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const transferVolume = transfers.reduce((sum, transaction) => sum + transaction.amount, 0);

  const creditWalletIds = new Set(
    dashboard.wallets.filter(wallet => wallet.kind === 'credit').map(wallet => wallet.id),
  );
  const creditExpenses = expenses.filter(transaction => creditWalletIds.has(transaction.walletId));
  const creditSpending = creditExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const creditPercent = spending ? Math.round((creditSpending / spending) * 100) : 0;
  const installments = creditExpenses.filter(transaction => transaction.installmentTenorMonths);
  const installmentSpending = installments.reduce((sum, transaction) => sum + transaction.amount, 0);

  const walletNames = new Map(dashboard.wallets.map(wallet => [wallet.id, wallet.name]));
  const budgetNames = new Map(budgets.map(budget => [budget.id, budget.category]));

  // ===== Sumber dana & tempat =====
  const walletSlices = groupBy(expenses, transaction => transaction.walletId).slice(0, 8);
  const merchantSlices = groupBy(
    expenses,
    transaction => transaction.merchant?.trim() || undefined,
  ).slice(0, 8);
  const walletPeak = Math.max(...walletSlices.map(slice => slice.total), 1);
  const merchantPeak = Math.max(...merchantSlices.map(slice => slice.total), 1);

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
        'Jumlah',
        'Dampak arus kas',
      ],
      ...transactions.map((transaction) => {
        const path = transaction.labels[0] ? categoryPath(transaction.labels[0]) : [];
        const at = new Date(transaction.date);
        return [
          at.toLocaleDateString('id-ID'),
          weekdayLabel(at.getDay(), 'id-ID', true),
          transaction.type,
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
          String(transaction.amount),
          String(cashDelta(transaction)),
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

      <div className="metric-grid report-metrics">
        <div className="metric-card m-in">
          <span>{t('reports.income')}</span>
          <b>{money.fmtCompact(income)}</b>
          <small>{selectedRangeLabel}</small>
        </div>
        <div className="metric-card m-out">
          <span>{t('reports.expense')}</span>
          <b>{money.fmtCompact(spending)}</b>
          <small>{expenses.length} {t('reports.txCount')}</small>
        </div>
        <div className={`metric-card m-net${netCashflow < 0 ? ' negative-net' : ''}`}>
          <span>{t('reports.netCashflow')}</span>
          <b>{money.fmtCompactSigned(netCashflow)}</b>
          <small>{t('reports.afterExpense')}</small>
        </div>
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
              [t('reports.income'), income, previousIncomeTotal, true, false],
              [t('reports.expense'), spending, previousSpending, false, false],
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
                    <b>{show(current)}</b>
                    <em className={tone}>{formatDelta(change)}</em>
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
          <svg
            viewBox="0 0 640 190"
            preserveAspectRatio="none"
            role="img"
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
          </svg>
        </div>
        <div className="chart-axis">
          {axisLabels.map(label => <span key={label.key}>{label.label}</span>)}
        </div>
      </div>

      {/* ===== Pola hari dalam seminggu ===== */}
      <div className="sec">
        <span className="t">{t('reports.weekdayPattern')}</span>
        <span className="daily-avg">{t('reports.weekdayScope')}</span>
      </div>
      <div className="weekday-card">
        {habitualExpenses.length === 0 ? (
          <div className="saving-empty">{t('reports.noData')}</div>
        ) : (
          <>
            <div className="weekday-rows">
              {weekdays.map((entry) => {
                const peak = priciestWeekday?.weekday === entry.weekday;
                return (
                  <div className={`weekday-row${peak ? ' peak' : ''}`} key={entry.weekday}>
                    <span className="weekday-name">{weekdayLabel(entry.weekday, locale)}</span>
                    <span className="weekday-bar">
                      {/* Nol tidak boleh menyisakan isi apa pun: min-width pada .weekday-bar i
                          membuat 0 tetap tampil sebagai secuil garis, dan itu membantah
                          angka "Rp 0" di sebelahnya. */}
                      {entry.average > 0 && (
                        <i style={{ width: `${(entry.average / weekdayPeak) * 100}%` }} />
                      )}
                    </span>
                    <span className="weekday-value">{money.fmtCompact(entry.average)}</span>
                    <span className="weekday-count">
                      {t('reports.weekdayOccurrence', { count: entry.occurrences })}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="weekday-summary">
              <div>
                <span>{t('reports.priciestWeekday')}</span>
                <b>{priciestWeekday ? weekdayLabel(priciestWeekday.weekday, locale, true) : '—'}</b>
                <small>{money.fmtCompact(priciestWeekday?.average ?? 0)}</small>
              </div>
              <div>
                <span>{t('reports.leanestWeekday')}</span>
                <b>{leanestWeekday ? weekdayLabel(leanestWeekday.weekday, locale, true) : '—'}</b>
                <small>{money.fmtCompact(leanestWeekday?.average ?? 0)}</small>
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

      <div className="sec">
        <span className="t">{t('reports.dailyReport')}</span>
        <span className="daily-avg">{t('reports.dailyAvg')} {money.fmtCompact(dailyAverage)}</span>
      </div>
      <div className="card daily-card">
        {daily.length === 0 && <div className="saving-empty">{t('reports.noData')}</div>}
        {daily.map(([key, entry]) => {
          const date = new Date(`${key}T12:00:00`);
          const net = entry.income - entry.expense;
          return (
            <div className="daily-row" key={key}>
              <div className="dr-date">
                <b>{date.toLocaleDateString(locale, { day: '2-digit' })}</b>
                <span>{date.toLocaleDateString(locale, { weekday: 'short', month: 'short' })}</span>
              </div>
              <div className="dr-bars">
                <div className="dr-bar"><i className="in" style={{ width: `${(entry.income / dailyMax) * 100}%` }} /></div>
                <div className="dr-bar"><i className="out" style={{ width: `${(entry.expense / dailyMax) * 100}%` }} /></div>
              </div>
              <div className="dr-nums">
                <span className="in">+{money.fmtCompact(entry.income)}</span>
                <span className="out">−{money.fmtCompact(entry.expense)}</span>
                <em className={net >= 0 ? 'positive' : 'negative'}>{money.fmtCompactSigned(net)}</em>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== Kategori bertingkat ===== */}
      <div className="sec">
        <span className="t">{t('reports.sectorBreakdown')}</span>
        <span className="daily-avg">{t('reports.sectorHint')}</span>
      </div>
      <div className="filter-pills sub-filter flow-toggle">
        {([['expense', t('reports.expense')], ['income', t('reports.income')]] as Array<[Flow, string]>)
          .map(([value, label]) => (
            <button
              key={value}
              className={flow === value ? 'on' : ''}
              onClick={() => { setFlow(value); setOpenSector(null); }}
            >
              {label}
              <span className="pill-count">
                {value === 'expense' ? expenses.length : incomeTransactions.length}
              </span>
            </button>
          ))}
      </div>
      <div className="category-report-card">
        {sectors.length === 0 ? (
          <div className="saving-empty">
            {flow === 'expense' ? t('reports.noData') : t('reports.noIncomeData')}
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
                    : (change > 0) === (flow === 'income') ? 'down' : 'up';
                const expandable = sector.children.length > 0;
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
                          <span>{share}% {flow === 'expense' ? t('reports.ofSpending') : t('reports.ofIncome')}</span>
                          <span>{sector.count} {t('reports.txCount')}</span>
                          {expandable && (
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
                    {open && (
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
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ===== Sumber dana & tempat ===== */}
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
        <div>
          <div className="sec"><span className="t">{t('reports.merchantBreakdown')}</span></div>
          <div className="breakdown-card">
            {merchantSlices.length === 0 ? (
              <div className="saving-empty">{t('reports.noMerchant')}</div>
            ) : merchantSlices.map((slice) => (
              <div className="breakdown-row" key={slice.key}>
                <div className="breakdown-head">
                  <b>{slice.key}</b>
                  <strong>{money.fmtCompact(slice.total)}</strong>
                </div>
                <div className="breakdown-bar">
                  <i className="warm" style={{ width: `${(slice.total / merchantPeak) * 100}%` }} />
                </div>
                <div className="breakdown-meta">
                  {slice.count} {t('reports.txCount')} · {t('reports.avgShort')}{' '}
                  {money.fmtCompact(Math.round(slice.total / slice.count))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Insight transaksi ===== */}
      <div className="sec"><span className="t">{t('reports.transactionInsights')}</span></div>
      <div className="transaction-insight-card">
        {expenses.length === 0 ? (
          <div className="saving-empty">{t('reports.noExpenseInsight')}</div>
        ) : (
          <>
            <div className="transaction-insight-feature">
              <span>{t('reports.largestExpense')}</span>
              <div>
                <b>{largestExpenseLabel}</b>
                <strong>{money.fmt(stats.largest)}</strong>
              </div>
            </div>
            <div className="transaction-insight-grid wide">
              <div>
                <span>{t('reports.avgTransaction')}</span>
                <b>{money.fmtCompact(stats.average)}</b>
                <small>{expenses.length} {t('reports.txCount')}</small>
              </div>
              <div>
                <span>{t('reports.medianTransaction')}</span>
                <b>{money.fmtCompact(stats.median)}</b>
                <small>{t('reports.smallestExpense')} {money.fmtCompact(stats.smallest)}</small>
              </div>
              <div>
                <span>{t('reports.busiestDay')}</span>
                <b>{busiestDayLabel}</b>
                <small>{money.fmtCompact(busiestDay?.[1].expense ?? 0)}</small>
              </div>
              <div>
                <span>{t('reports.creditShare')}</span>
                <b>{creditPercent}%</b>
                <small>{money.fmtCompact(creditSpending)}</small>
              </div>
              <div>
                <span>{t('reports.unexpectedShare')}</span>
                <b>{unexpectedPercent}%</b>
                <small>{unexpected.length} {t('reports.txCount')} · {money.fmtCompact(unexpectedTotal)}</small>
              </div>
              <div>
                <span>{t('reports.savingsMoved')}</span>
                <b>{money.fmtCompact(savingsMoved)}</b>
                <small>
                  {t('reports.transferVolume')} {money.fmtCompact(transferVolume)}
                </small>
              </div>
            </div>
            {installments.length > 0 && (
              <div className="transaction-insight-note">
                {t('reports.installmentSummary', {
                  count: installments.length,
                  amount: money.fmtCompact(installmentSpending),
                })}
              </div>
            )}
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
