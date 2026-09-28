'use client';

import React, { useState } from 'react';
import { useMoney, useT } from '../components/AppShell';
import type { PeriodPattern } from '../core/domain/period-patterns';

export default function PeriodPatternsScreen({ patterns, loading }: { patterns: PeriodPattern[]; loading: boolean }) {
  const money = useMoney();
  const t = useT();
  const [metric, setMetric] = useState<'expense' | 'income'>('expense');
  const latest = patterns.at(-1);
  const prior = patterns.at(-2);
  const recent = patterns.slice(-3);
  const average = recent.length
    ? Math.round(recent.reduce((sum, row) => sum + row[metric === 'expense' ? 'expensePerDay' : 'incomePerDay'], 0) / recent.length)
    : 0;
  const latestValue = latest?.[metric === 'expense' ? 'expensePerDay' : 'incomePerDay'] ?? 0;
  const previousValue = prior?.[metric === 'expense' ? 'expensePerDay' : 'incomePerDay'] ?? 0;
  const change = previousValue > 0 ? Math.round((latestValue - previousValue) / previousValue * 100) : null;
  const peak = Math.max(1, ...patterns.map(row => row[metric === 'expense' ? 'expensePerDay' : 'incomePerDay']));
  const categoryTotals = new Map<string, number>();
  patterns.forEach(row => row.categories.forEach((total, category) => {
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + total);
  }));
  const categories = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 4);

  if (!latest) return (
    <div className="pattern-empty">
      <b>{t(loading ? 'reports.patternLoading' : 'reports.patternEmptyTitle')}</b>
      {!loading && <p>{t('reports.patternEmptyBody')}</p>}
    </div>
  );

  return (
    <div className="period-patterns">
      <div className="report-metric-heading">
        <div>
          <span>{t('reports.patternTitle')}</span>
          <small>{t('reports.patternCount', { count: patterns.length })}</small>
        </div>
        <p>{t('reports.patternLead')}</p>
      </div>

      <section className="pattern-summary" aria-label={t('reports.patternTitle')}>
        <div>
          <span>{t('reports.patternLatestDaily')}</span>
          <b>{money.fmt(latestValue)}</b>
          <small>{latest.period.alias}</small>
        </div>
        <div>
          <span>{t('reports.patternAverageDaily', { count: recent.length })}</span>
          <b>{money.fmt(average)}</b>
          <small>{change == null
            ? t('reports.patternNoComparison')
            : t('reports.patternLatestChange', { change: `${change > 0 ? '+' : ''}${change}%` })}</small>
        </div>
      </section>

      <section className="pattern-card">
        <div className="pattern-card-head">
          <div>
            <b>{t('reports.patternDailyTrend')}</b>
            <small>{t('reports.patternDailyNote')}</small>
          </div>
          <div className="pattern-metric-switch" role="group" aria-label={t('reports.patternMetric')}>
            <button type="button" className={metric === 'expense' ? 'on' : ''}
              aria-pressed={metric === 'expense'} onClick={() => setMetric('expense')}>
              {t('reports.actualExpense')}
            </button>
            <button type="button" className={metric === 'income' ? 'on' : ''}
              aria-pressed={metric === 'income'} onClick={() => setMetric('income')}>
              {t('reports.actualIncome')}
            </button>
          </div>
        </div>
        <div className="pattern-bars">
          {patterns.map(row => {
            const amount = row[metric === 'expense' ? 'expensePerDay' : 'incomePerDay'];
            return (
              <div className="pattern-bar-row" key={row.period.id}>
                <span title={row.period.alias}>{row.period.alias}</span>
                <div className="pattern-bar-track" aria-hidden="true">
                  <i className={metric} style={{ width: amount > 0 ? `${Math.max(3, amount / peak * 100)}%` : '0%' }} />
                </div>
                <strong>{money.fmtCompact(amount)}</strong>
              </div>
            );
          })}
        </div>
      </section>

      {categories.length > 0 && (
        <section className="pattern-card">
          <div className="pattern-card-head">
            <div>
              <b>{t('reports.patternCategories')}</b>
              <small>{t('reports.patternCategoriesNote')}</small>
            </div>
          </div>
          <div className="pattern-category-list">
            {categories.map(([category]) => {
              const values = patterns.map(row => Math.round((row.categories.get(category) ?? 0) / row.days));
              const max = Math.max(1, ...values);
              return (
                <div className="pattern-category" key={category}>
                  <div className="pattern-category-heading">
                    <span>{category || t('reports.uncategorized')}</span>
                    <strong>{money.fmtCompact(values.at(-1) ?? 0)}{t('reports.perDaySuffix')}</strong>
                  </div>
                  <div className="pattern-category-spark" aria-label={t('reports.patternCategoryTrend', { category: category || t('reports.uncategorized') })}>
                    {values.map((value, index) => (
                      <i key={patterns[index].period.id} style={{ height: value > 0 ? `${Math.max(5, value / max * 100)}%` : '2px' }}
                        title={`${patterns[index].period.alias}: ${money.fmt(value)}${t('reports.perDaySuffix')}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="pattern-card">
        <div className="pattern-card-head">
          <div>
            <b>{t('reports.patternPeriodDetails')}</b>
            <small>{t('reports.patternPeriodDetailsNote')}</small>
          </div>
        </div>
        <div className="pattern-period-list">
          {[...patterns].reverse().map(row => (
            <article className="pattern-period" key={row.period.id}>
              <div className="pattern-period-heading">
                <b>{row.period.alias}</b>
                <small>{t('reports.patternDays', { count: row.days })}</small>
              </div>
              <div className="pattern-period-values">
                <div><span>{t('reports.actualIncome')}</span><strong>{money.fmt(row.income)}</strong></div>
                <div><span>{t('reports.actualExpense')}</span><strong>{money.fmt(row.expense)}</strong></div>
                <div><span>{t('reports.realNet')}</span><strong className={row.net < 0 ? 'negative' : 'positive'}>{money.fmtSigned(row.net)}</strong></div>
              </div>
              {row.budgetAllocated > 0 && <small className="pattern-budget-line">
                {t('reports.patternBudgetUsed', {
                  spent: money.fmt(row.budgetSpent),
                  allocated: money.fmt(row.budgetAllocated),
                })}
              </small>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
