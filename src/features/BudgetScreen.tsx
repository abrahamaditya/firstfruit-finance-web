'use client';
import React from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useActivePeriodTransactions, useBudgets, useDashboard } from '../application/hooks';
import { Check, Chevron, Plus, Warn } from '../components/ui/icons';

export default function BudgetScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const { budgets: allBudgets } = useBudgets();
  const { data: transactions } = useActivePeriodTransactions();
  const d = useDashboard();
  const [expandedBudgetId, setExpandedBudgetId] = React.useState<string | null>(null);
  const activePeriodId = d.period?.id;
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const budgets = activePeriodId
    ? allBudgets
        .filter(budget => budget.periodId === activePeriodId)
        .sort((a, b) => a.category.localeCompare(b.category, locale, { sensitivity: 'base' }))
    : [];
  const allocated = budgets.reduce((s, b) => s + b.allocated, 0);
  const spent = budgets.reduce((s, b) => s + b.spent, 0);
  const remaining = allocated - spent;
  const progress = allocated ? Math.round((spent / allocated) * 100) : 0;
  const transactionsByBudget = React.useMemo(() => transactions.reduce((groups, transaction) => {
    if (!transaction.budgetId) return groups;
    const current = groups.get(transaction.budgetId) ?? [];
    current.push(transaction);
    groups.set(transaction.budgetId, current);
    return groups;
  }, new Map<string, typeof transactions>()), [transactions]);

  // Simulasi kecil: sisa anggaran dibagi sisa hari periode.
  const daysLeft = Math.max(1, d.progress?.daysLeft ?? 1);
  const dayOf = d.progress?.dayOf ?? 0;
  const totalDays = d.progress?.totalDays ?? 30;
  const perDay = Math.round(remaining / daysLeft);
  const perWeek = perDay * 7;
  // Pace: sudah pakai berapa persen dibanding porsi hari yang sudah lewat.
  const idealSpent = totalDays ? allocated * (dayOf / totalDays) : 0;
  const paceDiff = spent - idealSpent;
  const onTrack = paceDiff <= 0;

  if (budgets.length === 0) {
    return (
      <>
        <div className="shero">
          <div className="sl">{t('budget.allocated')} · {d.period?.alias}</div>
          <div className="sa">{money.fmt(0)}</div>
        </div>
        <div className="empty-state budget-empty-screen">
          <b>{t('budget.emptyTitle')}</b>
          <span>{t('budget.emptyBody')}</span>
          <button className="cta compact" onClick={() => ui.openCreate('budget')}>
            <Plus />{t('common.add')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="shero">
        <div className="sl">{t('budget.allocated')} · {d.period?.alias}</div>
        <div className="sa">{money.fmt(allocated)}</div>
        <div className={`sp${d.safeToSpend < 0 ? ' negative' : ''}`}>
          {d.safeToSpend < 0 ? <Warn /> : <Check />}
          {money.fmtSigned(d.safeToSpend)}{' '}
          {t(d.safeToSpend < 0 ? 'budget.cashDeficit' : 'budget.unallocated')}
        </div>
      </div>
      <div className="mini-metrics">
        <div className="m-spend"><span>{t('budget.used')}</span><b>{money.fmt(spent)}</b></div>
        <div className={`m-left${remaining < 0 ? ' over' : ''}`}>
          <span>{t('budget.remaining')}</span>
          <b className={remaining < 0 ? 'negative' : 'positive'}>{money.fmt(remaining)}</b>
        </div>
        {/* Progres: biru saat aman, kuning ≥80%, merah saat lewat alokasi. */}
        <div className={`m-progress${progress > 100 ? ' over' : progress === 100 ? ' complete' : progress >= 80 ? ' warn' : ''}`}>
          <span>{t('budget.progress')}</span>
          <b>{progress}%</b>
          <div className="metric-bar"><i style={{ width: `${Math.min(100, progress)}%` }} /></div>
        </div>
      </div>
      <div className="sec"><span className="t">{t('budget.simulation')}</span><span className="daily-avg">{t('budget.daysLeft', { n: daysLeft })}</span></div>
      <div className="pace-card">
        <div className="pace-row">
          <div><span>{t('budget.perDay')}</span><b className={perDay < 0 ? 'negative' : ''}>{money.fmt(Math.max(0, perDay))}</b></div>
          <div><span>{t('budget.perWeek')}</span><b className={perWeek < 0 ? 'negative' : ''}>{money.fmt(Math.max(0, perWeek))}</b></div>
        </div>
        <div className={`pace-note${onTrack ? ' ok' : ' warn'}`}>
          {remaining < 0
            ? t('budget.paceOver', { amount: money.fmt(-remaining) })
            : onTrack
              ? t('budget.paceOk', { amount: money.fmt(Math.round(-paceDiff)) })
              : t('budget.paceFast', { amount: money.fmt(Math.round(paceDiff)) })}
        </div>
      </div>

      <div className="sec"><span className="t">{t('budget.perCategory')}</span><button className="addg" onClick={() => ui.openCreate('budget')}><Plus />{t('common.add')}</button></div>
      <div className="card">
        {budgets.map(b => (
          <div className="bline" key={b.id} onClick={() => ui.openItem(b.category, 'budget', b.id)}>
            <div className="brow">
              <span className="nm">{b.category}{b.over && <span className="tag-over">{t('budget.deficit')}</span>}</span>
              <span className="amt" aria-label={`${money.fmt(b.spent)} dari ${money.fmt(b.allocated)}`}>
                <span>{money.fmt(b.spent)}</span>
                <span>/ {money.fmt(b.allocated)}</span>
              </span>
            </div>
            <div className={`bar${b.over ? ' over' : b.spent === b.allocated ? ' complete' : ''}`}>
              <i style={{ width: Math.min(100, b.velocity * 100).toFixed(0) + '%' }} />
            </div>
            <div className="budget-foot">
              <span>{Math.round(b.velocity * 100)}% {t('budget.usedPct')}</span>
              {/* Jatah harian per kategori — angka yang paling sering dipakai sehari-hari. */}
              <span>{b.remaining > 0 ? `≈ ${money.fmt(Math.round(b.remaining / daysLeft))}/${t('budget.dayShort')}` : t('budget.noneLeft')}</span>
              <span>{b.remaining >= 0 ? `${money.fmt(b.remaining)} ${t('budget.leftSuffix')}` : `${money.fmt(b.remaining)} ${t('budget.deficit')}`}</span>
            </div>
            {(() => {
              const linkedTransactions = transactionsByBudget.get(b.id) ?? [];
              const expanded = expandedBudgetId === b.id;
              return (
                <>
                  <button
                    type="button"
                    className="budget-transactions-toggle"
                    aria-expanded={expanded}
                    onClick={(event) => {
                      event.stopPropagation();
                      setExpandedBudgetId((current) => current === b.id ? null : b.id);
                    }}
                  >
                    <span>{linkedTransactions.length} {t('budget.transactions')}</span>
                    <Chevron />
                  </button>
                  {expanded && (
                    <div className="budget-transactions" onClick={(event) => event.stopPropagation()}>
                      {linkedTransactions.length === 0 ? (
                        <span className="budget-transactions-empty">{t('budget.noTransactions')}</span>
                      ) : linkedTransactions.map((transaction) => {
                        const title = transaction.merchant || transaction.note || transaction.labels.at(-1) || t('budget.transaction');
                        const date = new Date(transaction.date).toLocaleDateString(locale, {
                          day: 'numeric', month: 'short', year: 'numeric',
                        });
                        return (
                          <button
                            type="button"
                            className="budget-transaction"
                            key={transaction.id}
                            onClick={() => ui.openItem(
                              title,
                              transaction.type === 'transfer' ? 'transfer' : 'transaksi',
                              transaction.id,
                            )}
                          >
                            <span><b>{title}</b><small>{date}</small></span>
                            <b>{money.fmt(transaction.amount)}</b>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </>
  );
}
