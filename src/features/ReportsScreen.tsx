'use client';

import React, { useState } from 'react';
import { useBudgets, useDashboard, useTransactions } from '../application/hooks';
import { useUI, useMoney, useT } from '../components/AppShell';
import { Download, TrendUp } from '../components/ui/icons';
import { addDays, dayKey, startOfDay } from '../core/domain/calendar';
import { categoryMid, categoryPath, categoryTop } from '../core/domain/categories';

type Range = 'daily' | 'thisMonth' | '3months' | '6months';

export default function ReportsScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const { data: allTransactions } = useTransactions();
  const { budgets } = useBudgets();
  const dashboard = useDashboard();
  const [range, setRange] = useState<Range>('thisMonth');
  const [catLevel, setCatLevel] = useState<'top' | 'mid' | 'leaf'>('mid');

  // Rentang benar-benar memfilter data, bukan cuma label.
  const rangeStart = (() => {
    const now = new Date();
    if (range === 'daily') return addDays(startOfDay(now), -6);          // 7 hari terakhir
    if (range === 'thisMonth') return new Date(now.getFullYear(), now.getMonth(), 1);
    const months = range === '3months' ? 3 : 6;
    return new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  })();
  const transactions = allTransactions.filter(
    (item) => !item.adjustment && new Date(item.date) >= rangeStart,
  );

  const expenses = transactions.filter((item) => item.type === 'expense');
  const income = transactions
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0);
  const spending = expenses.reduce((sum, item) => sum + item.amount, 0);
  const fixed = expenses
    .filter((item) => item.nature === 'fixed')
    .reduce((sum, item) => sum + item.amount, 0);
  const unexpected = spending - fixed;
  const plannedPercent = spending ? Math.round((fixed / spending) * 100) : 0;
  const circumference = 251;
  const dash = Math.round((plannedPercent / 100) * circumference);
  // Analisa kategori bisa dilihat di tiga tingkat: kelompok besar → kategori → spesifik.
  const levelKey = (label: string) =>
    catLevel === 'top' ? categoryTop(label) : catLevel === 'mid' ? categoryMid(label) : label;
  const categoryTotals = new Map<string, number>();
  expenses.forEach((item) => {
    const label = item.labels[0];
    if (!label) return;
    const key = levelKey(label);
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + item.amount);
  });
  const categories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCategory = Math.max(...categories.map(([, total]) => total), 1);
  const categorySum = categories.reduce((sum, [, total]) => sum + total, 0);

  // Laporan harian: satu baris per tanggal yang ada aktivitasnya, terbaru di atas.
  const dailyMap = new Map<string, { income: number; expense: number; count: number }>();
  transactions.forEach((item) => {
    if (item.type === 'transfer') return;
    const key = dayKey(item.date);
    const entry = dailyMap.get(key) ?? { income: 0, expense: 0, count: 0 };
    if (item.type === 'income') entry.income += item.amount; else entry.expense += item.amount;
    entry.count += 1;
    dailyMap.set(key, entry);
  });
  const daily = [...dailyMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 31);
  const dailyMax = Math.max(...daily.map(([, entry]) => Math.max(entry.income, entry.expense)), 1);
  const dailyAverage = daily.length
    ? Math.round(daily.reduce((sum, [, entry]) => sum + entry.expense, 0) / daily.length)
    : 0;

  const exportCsv = () => {
    const rows = [
      // Tiap tingkat kategori jadi kolom sendiri supaya bisa di-pivot di spreadsheet.
      ['Tanggal', 'Jenis', 'Catatan', 'Tempat', 'Kelompok besar', 'Kategori', 'Spesifik', 'Jumlah'],
      ...transactions.map((item) => {
        const path = item.labels[0] ? categoryPath(item.labels[0]) : [];
        return [
          new Date(item.date).toLocaleDateString('id-ID'),
          item.type,
          item.note || '',
          item.merchant || '',
          path[0] || '',
          path[1] || '',
          path[2] || '',
          String(item.amount),
        ];
      }),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'laporan-keuangan.csv';
    anchor.click();
    URL.revokeObjectURL(url);
    ui.notify(t('reports.exported'));
  };

  return (
    <>
      <div className="report-actions">
        <div className="filter-pills report-range">
          {[['daily', t('reports.daily')], ['thisMonth', t('reports.thisMonth')], ['3months', t('reports.3months')], ['6months', t('reports.6months')]].map(([value, label]) => (
            <button key={value} className={range === value ? 'on' : ''} onClick={() => setRange(value as Range)}>{label}</button>
          ))}
        </div>
        <button className="addg" onClick={exportCsv}><Download />{t('reports.export')}</button>
      </div>

      {/* Tiga metrik dengan peran berbeda — warnanya dibedakan agar terbaca sekilas. */}
      <div className="metric-grid">
        <div className="metric-card m-in"><span>{t('reports.income')}</span><b>{money.fmtCompact(income)}</b><small>{t('reports.thisPeriod')}</small></div>
        <div className="metric-card m-out"><span>{t('reports.expense')}</span><b>{money.fmtCompact(spending)}</b><small>{expenses.length} {t('reports.txCount')}</small></div>
        <div className={`metric-card m-net${income - spending < 0 ? ' negative-net' : ''}`}><span>{t('reports.netCashflow')}</span><b>{money.fmtCompact(income - spending)}</b><small>{t('reports.afterExpense')}</small></div>
      </div>

      <div className="sec"><span className="t">{t('reports.balanceTrend')} · {t('reports.' + range).toLowerCase()}</span></div>
      <div className="chart-card">
        <div className="ct">
          <div><div className="cv">{money.fmtCompact(dashboard.liquidity)}</div><span className="chart-caption">{t('reports.currentBalance')}</span></div>
          <div className="cd"><TrendUp /> 12,4%</div>
        </div>
        <div className="chart">
          <svg viewBox="0 0 640 190" preserveAspectRatio="none" aria-label="Grafik tren saldo">
            <defs>
              <linearGradient id="balance-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2BCC8E" stopOpacity=".42" />
                <stop offset="1" stopColor="#2BCC8E" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[35, 75, 115, 155].map((y) => <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="rgba(255,255,255,.05)" />)}
            <path d="M0,150 L105,126 L210,138 L320,88 L425,100 L532,54 L640,34 L640,190 L0,190 Z" fill="url(#balance-area)" />
            <path d="M0,150 L105,126 L210,138 L320,88 L425,100 L532,54 L640,34" fill="none" stroke="#5BE9AA" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="640" cy="34" r="6" fill="#5BE9AA" />
          </svg>
        </div>
        <div className="chart-axis"><span>Feb</span><span>Mar</span><span>Apr</span><span>Mei</span><span>Jun</span><span>Jul</span></div>
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
                <span className="out">-{money.fmtCompact(entry.expense)}</span>
                <em className={net >= 0 ? 'positive' : 'negative'}>{money.fmtCompact(net)}</em>
              </div>
            </div>
          );
        })}
      </div>

      <div className="report-columns">
        <div>
          <div className="sec"><span className="t">{t('reports.plannedVsUnexpected')}</span></div>
          <div className="donut-card">
            <div className="donut">
              <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r="40" fill="none" stroke="#EF8676" strokeWidth={13} />
                <circle cx="50" cy="50" r="40" fill="none" stroke="#5BE9AA" strokeWidth={13} strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
              </svg>
              <div className="c"><div><b>{plannedPercent}%</b><br /><span>Terencana</span></div></div>
            </div>
            <div className="legend">
              <div className="lg"><span className="sw" style={{ background: '#5BE9AA' }} /><span className="lt">{t('reports.planned')}</span><span className="lv">{money.fmt(fixed)}</span></div>
              <div className="lg"><span className="sw" style={{ background: '#EF8676' }} /><span className="lt">{t('reports.unexpected')}</span><span className="lv">{money.fmt(unexpected)}</span></div>
            </div>
          </div>
        </div>
        <div>
          <div className="sec"><span className="t">{t('reports.topCategories')}</span></div>
          <div className="mseg cat-level">
            {([['top', t('reports.levelTop')], ['mid', t('reports.levelMid')], ['leaf', t('reports.levelLeaf')]] as const).map(([value, label]) => (
              <button key={value} className={catLevel === value ? 'on' : ''} onClick={() => setCatLevel(value)}>{label}</button>
            ))}
          </div>
          <div className="cat-card">
            {categories.length === 0 && <div className="saving-empty">{t('reports.noData')}</div>}
            {categories.map(([name, total]) => (
              <div className="cb" key={name}>
                <div className="crow">
                  <span className="cn">{name}</span>
                  <span className="cv2">{money.fmt(total)}</span>
                </div>
                <div className="cbar"><i style={{ width: `${(total / maxCategory) * 100}%` }} /></div>
                <div className="cshare">
                  {categorySum ? Math.round((total / categorySum) * 100) : 0}% {t('reports.ofSpending')}
                  {catLevel === 'leaf' && categoryPath(name).length > 1 && ` · ${categoryPath(name).slice(0, -1).join(' › ')}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
