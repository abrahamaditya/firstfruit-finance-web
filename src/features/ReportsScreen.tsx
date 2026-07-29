'use client';

import React, { useState } from 'react';
import { useBudgets, useDashboard, useTransactions } from '../application/hooks';
import { useUI, useMoney, useT } from '../components/AppShell';
import { Download, TrendUp } from '../components/ui/icons';
import { addDays, dayKey, startOfDay } from '../core/domain/calendar';
import { categoryMid, categoryPath } from '../core/domain/categories';
import type { Transaction } from '../core/domain/types';

type Range = 'daily' | 'activePeriod' | '3months' | '6months';

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

export default function ReportsScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const { data: allTransactions } = useTransactions();
  const { budgets } = useBudgets();
  const dashboard = useDashboard();
  const [range, setRange] = useState<Range>('activePeriod');

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
  const income = transactions
    .filter(transaction => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const spending = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const netCashflow = income - spending;
  const activeBudgets = dashboard.period
    ? budgets.filter(budget => budget.periodId === dashboard.period?.id)
    : [];
  const totalBudget = activeBudgets.reduce((sum, budget) => sum + budget.allocated, 0);
  const usedBudget = activeBudgets.reduce((sum, budget) => sum + budget.spent, 0);
  const remainingBudget = totalBudget - usedBudget;
  const budgetUsage = totalBudget ? Math.round((usedBudget / totalBudget) * 100) : 0;

  // Laporan memakai tingkat kategori menengah secara konsisten. Label spesifik otomatis
  // digabungkan ke induknya; kategori bebas tetap berdiri sendiri.
  const levelKey = (label: string) => categoryMid(label);
  const categoryTotals = new Map<string, { total: number; count: number }>();
  expenses.forEach((transaction) => {
    const label = transaction.labels[0];
    if (!label) return;
    const key = levelKey(label);
    const current = categoryTotals.get(key) ?? { total: 0, count: 0 };
    categoryTotals.set(key, {
      total: current.total + transaction.amount,
      count: current.count + 1,
    });
  });
  const selectedRangeDays = calendarDays(rangeStart, rangeEnd);
  const previousRangeStart = addDays(rangeStart, -selectedRangeDays);
  const previousCategoryTotals = new Map<string, number>();
  allTransactions
    .filter((transaction) => {
      const at = new Date(transaction.date);
      return !transaction.adjustment
        && transaction.type === 'expense'
        && at >= previousRangeStart
        && at < rangeStart;
    })
    .forEach((transaction) => {
      const label = transaction.labels[0];
      if (!label) return;
      const key = levelKey(label);
      previousCategoryTotals.set(
        key,
        (previousCategoryTotals.get(key) ?? 0) + transaction.amount,
      );
    });
  const categories = [...categoryTotals.entries()]
    .map(([name, stats]) => ({
      name,
      ...stats,
      previousTotal: previousCategoryTotals.get(name) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const topCategory = categories[0];
  const shownCategoryTotal = categories.reduce((sum, category) => sum + category.total, 0);
  const otherCategoryTotal = Math.max(0, spending - shownCategoryTotal);

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
  const dailyAverage = Math.round(spending / calendarDays(rangeStart, rangeEnd));
  const averageExpense = expenses.length ? Math.round(spending / expenses.length) : 0;
  const largestExpense = [...expenses].sort((a, b) => b.amount - a.amount)[0];
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
  const creditWalletIds = new Set(
    dashboard.wallets.filter(wallet => wallet.kind === 'credit').map(wallet => wallet.id),
  );
  const creditExpenses = expenses.filter(transaction => creditWalletIds.has(transaction.walletId));
  const creditSpending = creditExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const creditPercent = spending ? Math.round((creditSpending / spending) * 100) : 0;
  const installments = creditExpenses.filter(transaction => transaction.installmentTenorMonths);
  const installmentSpending = installments.reduce((sum, transaction) => sum + transaction.amount, 0);

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
  const walletNames = new Map(dashboard.wallets.map(wallet => [wallet.id, wallet.name]));
  const budgetNames = new Map(budgets.map(budget => [budget.id, budget.category]));

  const exportCsv = () => {
    const rows = [
      [
        'Tanggal',
        'Jenis',
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
        return [
          new Date(transaction.date).toLocaleDateString('id-ID'),
          transaction.type,
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

      <div className="report-columns">
        <div>
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
                    <strong>{money.fmt(largestExpense?.amount ?? 0)}</strong>
                  </div>
                </div>
                <div className="transaction-insight-grid">
                  <div>
                    <span>{t('reports.avgTransaction')}</span>
                    <b>{money.fmtCompact(averageExpense)}</b>
                    <small>{expenses.length} {t('reports.txCount')}</small>
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
        </div>
        <div>
          <div className="sec">
            <span className="t">{t('reports.categoryAnalysis')}</span>
            <span className="daily-avg">{t('reports.vsPreviousRange')}</span>
          </div>
          <div className="category-report-card">
            {categories.length === 0 && <div className="saving-empty">{t('reports.noData')}</div>}
            {categories.length > 0 && (
              <>
                <div className="category-report-overview">
                  <div>
                    <span>{t('reports.largestCategory')}</span>
                    <b>{topCategory.name}</b>
                    <small>
                      {money.fmtCompact(topCategory.total)} · {spending
                        ? Math.round((topCategory.total / spending) * 100)
                        : 0}%
                    </small>
                  </div>
                  <div>
                    <span>{t('reports.activeCategories')}</span>
                    <b>{categoryTotals.size}</b>
                    <small>{expenses.length} {t('reports.txCount')}</small>
                  </div>
                </div>
                <div className="category-distribution" aria-label={t('reports.categoryDistribution')}>
                  {categories.map((category, index) => (
                    <i
                      key={category.name}
                      style={{
                        width: `${spending ? (category.total / spending) * 100 : 0}%`,
                        background: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                      }}
                      title={`${category.name}: ${money.fmt(category.total)}`}
                    />
                  ))}
                  {otherCategoryTotal > 0 && (
                    <i
                      className="other"
                      style={{ width: `${(otherCategoryTotal / spending) * 100}%` }}
                      title={`${t('reports.otherCategories')}: ${money.fmt(otherCategoryTotal)}`}
                    />
                  )}
                </div>
                <div className="category-report-list">
                  {categories.map((category, index) => {
                    const share = spending ? Math.round((category.total / spending) * 100) : 0;
                    const average = Math.round(category.total / category.count);
                    const change = category.previousTotal
                      ? ((category.total - category.previousTotal) / category.previousTotal) * 100
                      : null;
                    const trendClass = change == null
                      ? 'new'
                      : change > 0
                        ? 'up'
                        : change < 0
                          ? 'down'
                          : 'flat';
                    const trendLabel = change == null
                      ? t('reports.newCategory')
                      : `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change).toLocaleString(locale, {
                          maximumFractionDigits: 0,
                        })}%`;
                    return (
                      <div className="category-report-row" key={category.name}>
                        <span
                          className="category-rank"
                          style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                        >
                          {index + 1}
                        </span>
                        <div className="category-report-main">
                          <div className="category-report-head">
                            <b>{category.name}</b>
                            <strong>{money.fmt(category.total)}</strong>
                          </div>
                          <div className="category-report-meta">
                            <span>{share}% {t('reports.ofSpending')}</span>
                            <span>{category.count} {t('reports.txCount')}</span>
                            <span>{t('reports.avgShort')} {money.fmtCompact(average)}</span>
                            <em className={trendClass}>{trendLabel}</em>
                          </div>
                          <div className="category-share-bar">
                            <i
                              style={{
                                width: `${spending ? (category.total / spending) * 100 : 0}%`,
                                background: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
