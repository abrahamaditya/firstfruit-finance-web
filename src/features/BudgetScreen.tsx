'use client';
import React from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useBudgets, useDashboard, useInstallments, usePeriodTransactions, usePeriods } from '../application/hooks';
import { installmentDuesForPeriod, type InstallmentDue } from '../core/domain/installment-schedule';
import { Card, Check, Chevron, Plus, Warn } from '../components/ui/icons';

function InstallmentBudgetSection({
  title, detail, dues, future,
}: {
  title: string;
  detail?: string;
  dues: InstallmentDue[];
  future?: boolean;
}) {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const total = dues.reduce((sum, due) => sum + due.amount, 0);
  const unpaid = dues.filter((due) => !due.paid).reduce((sum, due) => sum + due.amount, 0);
  return (
    <section className="installment-budget-section">
      <div className="sec"><span className="t">{title}</span></div>
      <div className="installment-budget-card">
        <div className="installment-budget-summary">
          <div><b>{money.fmt(future ? unpaid : total)}</b><small>{detail}</small></div>
          <span>{dues.length} {t('budget.installmentCount')}</span>
        </div>
        {dues.length > 0 ? dues.map((due) => (
          <button
            type="button"
            className="installment-budget-row"
            key={due.id}
            onClick={() => ui.openItem(due.title, 'transaksi', due.transactionId)}
          >
            <span className="installment-budget-icon"><Card /></span>
            <span className="installment-budget-name">
              <b>{due.title}</b>
              <small>
                {new Date(`${due.dueDate}T12:00:00`).toLocaleDateString(locale, {
                  day: 'numeric', month: 'short', year: 'numeric',
                })} · {due.number}/{due.tenor}
                {due.paid && ` · ${t('installments.paid')}`}
              </small>
            </span>
            <strong>{money.fmt(due.amount)}</strong>
          </button>
        )) : <p className="installment-budget-empty">{t('budget.noInstallments')}</p>}
        <p className="installment-budget-note">{t('budget.installmentAccounting')}</p>
      </div>
    </section>
  );
}

export default function BudgetScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const { budgets: allBudgets } = useBudgets();
  const { data: installments } = useInstallments();
  const { periods } = usePeriods();
  const { data: transactions, period: viewedPeriod } = usePeriodTransactions(ui.periodId);
  const d = useDashboard();
  const [expandedBudgetId, setExpandedBudgetId] = React.useState<string | null>(null);
  const viewedPeriodId = viewedPeriod?.id ?? d.period?.id;
  const isArchive = ui.isArchivePeriod;
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const budgets = viewedPeriodId
    ? allBudgets
        .filter(budget => budget.periodId === viewedPeriodId)
        .sort((a, b) => a.category.localeCompare(b.category, locale, { sensitivity: 'base' }))
    : [];
  const currentDues = viewedPeriod && viewedPeriod.status !== 'closed'
    ? installmentDuesForPeriod(installments, viewedPeriod)
    : [];
  const followingDraft = viewedPeriod && !isArchive
    ? periods.filter((period) => period.status === 'draft'
        && period.start.slice(0, 10) > viewedPeriod.end.slice(0, 10))
      .sort((a, b) => a.start.localeCompare(b.start))[0]
    : undefined;
  const nextStart = viewedPeriod ? new Date(viewedPeriod.end.slice(0, 10) + 'T12:00:00Z') : null;
  nextStart?.setUTCDate(nextStart.getUTCDate() + 1);
  const nextEnd = nextStart ? (() => {
    const year = nextStart.getUTCFullYear();
    const month = nextStart.getUTCMonth();
    const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
    return new Date(Date.UTC(year, month + 1, Math.min(nextStart.getUTCDate(), lastDay) - 1, 12));
  })() : null;
  const nextPeriod = followingDraft ?? (nextStart && nextEnd ? {
    start: nextStart.toISOString(), end: nextEnd.toISOString(),
  } : null);
  const nextDues = !isArchive && nextPeriod
    ? installmentDuesForPeriod(installments, nextPeriod).filter((due) => !due.paid)
    : [];
  const hasInstallmentDues = currentDues.length + nextDues.length > 0;
  const nextRange = nextPeriod
    ? `${new Date(nextPeriod.start).toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – `
      + new Date(nextPeriod.end).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const installmentSections = <>
    {currentDues.length > 0 && (
      <InstallmentBudgetSection title={t('budget.installmentsCurrent')} dues={currentDues}
        detail={t('budget.installmentsCurrentDetail')} />
    )}
    {nextDues.length > 0 && (
      <InstallmentBudgetSection title={t('budget.installmentsNext')} dues={nextDues} future
        detail={nextRange} />
    )}
  </>;
  const manualAllocated = budgets.reduce((s, b) => s + b.allocated, 0);
  const manualSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const allocated = manualAllocated + currentDues.reduce((sum, due) => sum + due.amount, 0);
  const spent = manualSpent + currentDues.filter((due) => due.paid)
    .reduce((sum, due) => sum + due.amount, 0);
  const remaining = allocated - spent;
  const manualRemaining = manualAllocated - manualSpent;
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
  const perDay = Math.round(manualRemaining / daysLeft);
  const perWeek = perDay * 7;
  // Pace: sudah pakai berapa persen dibanding porsi hari yang sudah lewat.
  const idealSpent = totalDays ? manualAllocated * (dayOf / totalDays) : 0;
  const paceDiff = manualSpent - idealSpent;
  const onTrack = paceDiff <= 0;

  if (budgets.length === 0) {
    return (
      <>
        <div className="shero">
          <div className="sl">{t('budget.allocated')} · {viewedPeriod?.alias ?? d.period?.alias}</div>
          <div className="sa">{money.fmt(allocated)}</div>
        </div>
        <div className={`empty-state budget-empty-screen${hasInstallmentDues ? ' compact' : ''}`}>
          <b>{t(hasInstallmentDues ? 'budget.emptyManualTitle' : 'budget.emptyTitle')}</b>
          <span>{t(hasInstallmentDues ? 'budget.emptyManualBody' : 'budget.emptyBody')}</span>
          {!isArchive && (
            <button className="cta compact" onClick={() => ui.openCreate('budget')}>
              <Plus />{t('common.add')}
            </button>
          )}
        </div>
        {installmentSections}
      </>
    );
  }

  return (
    <>
      <div className="shero">
        <div className="sl">{t('budget.allocated')} · {viewedPeriod?.alias ?? d.period?.alias}</div>
        <div className="sa">{money.fmt(allocated)}</div>
        {!isArchive && <div className={`sp${d.safeToSpend < 0 ? ' negative' : ''}`}>
          {d.safeToSpend < 0 ? <Warn /> : <Check />}
          {money.fmtSigned(d.safeToSpend)}{' '}
          {t(d.safeToSpend < 0 ? 'budget.cashDeficit' : 'budget.unallocated')}
        </div>}
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
      {!isArchive && <>
      <div className="sec"><span className="t">{t('budget.simulation')}</span><span className="daily-avg">{t('budget.daysLeft', { n: daysLeft })}</span></div>
      <div className="pace-card">
        <div className="pace-row">
          <div><span>{t('budget.perDay')}</span><b className={perDay < 0 ? 'negative' : ''}>{money.fmt(Math.max(0, perDay))}</b></div>
          <div><span>{t('budget.perWeek')}</span><b className={perWeek < 0 ? 'negative' : ''}>{money.fmt(Math.max(0, perWeek))}</b></div>
        </div>
        <div className={`pace-note${onTrack ? ' ok' : ' warn'}`}>
          {manualRemaining < 0
            ? t('budget.paceOver', { amount: money.fmt(-manualRemaining) })
            : onTrack
              ? t('budget.paceOk', { amount: money.fmt(Math.round(-paceDiff)) })
              : t('budget.paceFast', { amount: money.fmt(Math.round(paceDiff)) })}
        </div>
        {currentDues.length > 0 && <small className="pace-scope-note">{t('budget.dailyExcludesInstallments')}</small>}
      </div>
      </>}

      <div className="sec"><span className="t">{t('budget.perCategory')}</span>{!isArchive && <button className="addg" onClick={() => ui.openCreate('budget')}><Plus />{t('common.add')}</button>}</div>
      <div className="card">
        {budgets.map(b => (
          <div className={`bline${isArchive ? ' readonly' : ''}`} key={b.id} onClick={isArchive ? undefined : () => ui.openItem(b.category, 'budget', b.id)}>
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
              {!isArchive && <span>{b.remaining > 0 ? `≈ ${money.fmt(Math.round(b.remaining / daysLeft))}/${t('budget.dayShort')}` : t('budget.noneLeft')}</span>}
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
      {installmentSections}
    </>
  );
}
