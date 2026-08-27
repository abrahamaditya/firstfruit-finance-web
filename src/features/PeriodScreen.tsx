'use client';

import React, { useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { usePeriodReport, usePeriodTransactions, usePeriods } from '../application/hooks';
import { useRepositories } from '../infrastructure/RepositoryProvider';
import { Calendar, Check, Chevron, Gauge, Info, ListIcon, Lock, Plus, WalletIcon } from '../components/ui/icons';

/**
 * Laporan satu periode. Periode dipilih lewat sheet "Ganti periode"; layar ini
 * membacanya kembali sebagai dashboard, lalu — kalau periodenya masih berjalan —
 * menawarkan tutup buku dengan atau tanpa membuka periode berikutnya.
 */
export default function PeriodScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const repos = useRepositories();
  const report = usePeriodReport(ui.periodId);
  const { data: periodTransactions } = usePeriodTransactions(ui.periodId);
  const { periods, active: activePeriod } = usePeriods();
  // Tutup buku dua langkah: tombolnya cuma membuka pilihan, keputusan "buat periode
  // berikutnya atau tidak" dijawab setelah kotak konfirmasi dicentang.
  const [asking, setAsking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [nextAlias, setNextAlias] = useState('');
  const [nextChoice, setNextChoice] = useState<'draft' | 'new'>('new');
  const [targetDraftId, setTargetDraftId] = useState('');
  const [copyBudgetIds, setCopyBudgetIds] = useState<string[]>([]);
  const [expandedBudgetId, setExpandedBudgetId] = useState<string | null>(null);
  const [expandedCategoryName, setExpandedCategoryName] = useState<string | null>(null);

  const current = report.period;
  // Tiga keadaan, bukan dua: draft belum pernah berjalan, jadi ia tidak bisa ditutup
  // dan juga bukan arsip.
  const isDraft = current?.status === 'draft';
  const canOpenDraft = isDraft && !activePeriod;
  const followingDrafts = current
    ? periods
      .filter((period) => period.status === 'draft' && +new Date(period.start) > +new Date(current.end))
      .sort((a, b) => +new Date(a.start) - +new Date(b.start))
    : [];
  const targetDraft = followingDrafts.find((period) => period.id === targetDraftId);

  // Rentang berikutnya tetap dihitung dari periode berjalan. Namanya sengaja tidak
  // ditebak dari tanggal; pengguna mengisinya sendiri saat konfirmasi.
  const nextStart = current ? new Date(current.end) : null;
  nextStart?.setDate(nextStart.getDate() + 1);
  const nextEnd = nextStart ? new Date(nextStart) : null;
  if (nextEnd) { nextEnd.setMonth(nextEnd.getMonth() + 1); nextEnd.setDate(nextEnd.getDate() - 1); }
  const range = (from?: Date | string | null, to?: Date | string | null) =>
    from && to
      ? `${new Date(from).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(to).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : '';

  const closePeriod = async (next: 'new' | 'draft' | 'none') => {
    if (!current) return;
    const customNextAlias = nextAlias.trim();
    if (next === 'new' && !customNextAlias) return;
    if (next === 'draft' && !targetDraft) return;
    const destinationName = next === 'draft' ? targetDraft?.alias ?? '' : customNextAlias;
    setClosing(true);
    try {
      await repos.commands.closePeriod(current.id, {
        createNext: next === 'new',
        nextAlias: next === 'new' ? customNextAlias : undefined,
        targetDraftId: next === 'draft' ? targetDraft?.id : undefined,
        budgetIds: next !== 'none' ? copyBudgetIds : undefined,
      });
      // Periode yang barusan ditutup tidak lagi jadi pilihan aktif — biarkan layar
      // kembali ke periode berjalan (kalau ada) lewat pilihan kosong.
      ui.selectPeriod(null);
      ui.refresh();
      ui.notify(next !== 'none'
        ? t('closing.transition', { from: current.alias, to: destinationName })
        : t('closing.closedOnly', { name: current.alias }));
      setAsking(false);
      setConfirmed(false);
      setNextAlias('');
      setTargetDraftId('');
      if (next !== 'none') ui.go('home');
    } catch (caught) {
      ui.notify(caught instanceof Error ? caught.message : 'Periode gagal ditutup');
    } finally {
      setClosing(false);
    }
  };

  const openPeriod = async () => {
    if (!current || !canOpenDraft) return;
    setOpening(true);
    try {
      await repos.commands.openPeriod(current.id);
      ui.selectPeriod(null);
      ui.refresh();
      ui.notify(t('period.opened', { name: current.alias }));
      ui.go('home');
    } catch (caught) {
      ui.notify(caught instanceof Error ? caught.message : t('period.openFailed'));
    } finally {
      setOpening(false);
    }
  };

  if (!current) {
    return (
      <div className="empty-state">
        <Calendar />
        <b>{t('period.emptyTitle')}</b>
        <span>{t('closing.noPeriods')}</span>
        <button className="cta compact period-empty-cta" onClick={() => ui.openCreate('periode')}>
          <Plus />{t('period.create')}
        </button>
      </div>
    );
  }

  const categoryMax = Math.max(...report.categories.map((c) => c.total), 1);
  const transactionTitle = (transaction: typeof periodTransactions[number]) =>
    transaction.merchant || transaction.note || transaction.labels.at(-1) || t('budget.transaction');
  const transactionDate = (date: string) => new Date(date).toLocaleDateString(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <>
      <div className="closing-hero">
        <div className="closing-icon">{report.isActive || isDraft ? <Calendar /> : <Lock />}</div>
        <div>
          <span>
            {current.alias} · {isDraft
              ? t('planning.draft')
              : report.isActive ? t('closing.statusActive') : t('closing.statusClosed')}
          </span>
          <strong>{money.fmtSigned(report.net)}</strong>
          <small>
            {t('period.netCashflow')} · {range(current.start, current.end)}
          </small>
        </div>
        <button className="period-switch-btn" onClick={ui.openPeriods}>
          <ListIcon />{t('side.switchPeriod')}
        </button>
      </div>

      {!isDraft && (
        <div className="period-data-nav" aria-label="Data periode">
          <button type="button" onClick={() => ui.go('tx')}><ListIcon /><span>Transaksi</span></button>
          <button type="button" onClick={() => ui.go('wallets')}><WalletIcon /><span>Dompet</span></button>
          <button type="button" onClick={() => ui.go('budget')}><Gauge /><span>Anggaran</span></button>
        </div>
      )}

      <div className="metric-grid period-metrics">
        <div className="metric-card m-in">
          <span>{t('reports.income')}</span>
          <b>{money.fmtCompact(report.income)}</b>
          <small>{t('period.inThisPeriod')}</small>
        </div>
        <div className="metric-card m-in">
          <span>{t('reports.actualIncome')}</span>
          <b>{money.fmtCompact(report.actualIncome)}</b>
          <small>{t('period.inThisPeriod')}</small>
        </div>
        <div className="metric-card m-out">
          <span>{t('reports.expense')}</span>
          <b>{money.fmtCompact(report.expense)}</b>
          <small>{report.txCount} {t('reports.txCount')}</small>
        </div>
        <div className={`metric-card m-net${report.net < 0 ? ' negative-net' : ''}`}>
          <span>{t('reports.netCashflow')}</span>
          <b>{money.fmtCompactSigned(report.net)}</b>
          <small>{t('reports.afterExpense')}</small>
        </div>
      </div>

      {/* Angka kas hanya berarti untuk periode berjalan — arsip tidak menyimpan saldo historis. */}
      {report.isActive && (
        <div className="brk-card">
          <div className="brk-cells">
            <div><span>{t('home.liquidity')}</span><b>{money.fmtCompactSigned(report.liquidity)}</b></div>
            <div><span>{t('home.inSavings')}</span><b>{report.reserved > 0 ? '−' : ''}{money.fmtCompact(report.reserved)}</b></div>
            <div>
              <span>{t('home.safeToSpend')}</span>
              <b className={report.safeToSpend < 0 ? 'negative' : undefined}>
                {money.fmtCompactSigned(report.safeToSpend)}
              </b>
            </div>
          </div>
          {report.progress && (
            <div className="card-foot">
              <div className="brk-bar"><i style={{ width: `${(report.progress.fraction * 100).toFixed(0)}%` }} /></div>
              <span>
                {report.progress.dayOf}/{report.progress.totalDays} {t('home.days')} · {Math.max(0, report.progress.daysLeft)} {t('home.daysLeft')}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="sec"><span className="t">{t('period.budgetSection')}</span></div>
      <div className="cat-card">
        {report.budgets.length === 0 && <div className="saving-empty">{t('period.noBudgets')}</div>}
        {report.budgets.map((budget) => {
          const linkedTransactions = periodTransactions.filter((transaction) => transaction.budgetId === budget.id);
          const expanded = expandedBudgetId === budget.id;
          return (
          <div className="cb" key={budget.id}>
            <div className="crow">
              <span className="cn">{budget.category}</span>
              <span className="cv2">{money.fmt(budget.spent)} / {money.fmt(budget.allocated)}</span>
            </div>
            <div className="cbar">
              <i
                className={budget.over ? 'over' : undefined}
                style={{ width: `${Math.min(100, budget.velocity * 100)}%` }}
              />
            </div>
            <div className="cshare">
              {budget.over
                ? `${money.fmt(-budget.remaining)} ${t('budget.deficit')}`
                : `${money.fmt(budget.remaining)} ${t('budget.leftSuffix')}`}
            </div>
            <button
              type="button"
              className="budget-transactions-toggle"
              aria-expanded={expanded}
              onClick={() => setExpandedBudgetId((currentId) => currentId === budget.id ? null : budget.id)}
            >
              <span>{linkedTransactions.length} {t('budget.transactions')}</span>
              <Chevron />
            </button>
            {expanded && (
              <div className="budget-transactions">
                {linkedTransactions.length === 0 ? (
                  <span className="budget-transactions-empty">{t('budget.noTransactions')}</span>
                ) : linkedTransactions.map((transaction) => (
                  <button
                    type="button"
                    className="budget-transaction"
                    key={transaction.id}
                    onClick={() => ui.openItem(
                      transactionTitle(transaction),
                      transaction.type === 'transfer' ? 'transfer' : 'transaksi',
                      transaction.id,
                    )}
                  >
                    <span><b>{transactionTitle(transaction)}</b><small>{transactionDate(transaction.date)}</small></span>
                    <b>{money.fmt(transaction.amount)}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
          );
        })}
      </div>

      <div className="sec"><span className="t">{t('reports.topCategories')}</span></div>
      <div className="cat-card">
        {report.categories.length === 0 && <div className="saving-empty">{t('reports.noData')}</div>}
        {report.categories.map((category) => {
          const linkedTransactions = periodTransactions.filter((transaction) =>
            transaction.type === 'expense' && transaction.labels[0] === category.name,
          );
          const expanded = expandedCategoryName === category.name;
          return (
          <div className="cb" key={category.name}>
            <div className="crow">
              <span className="cn">{category.name}</span>
              <span className="cv2">{money.fmt(category.total)}</span>
            </div>
            <div className="cbar"><i style={{ width: `${(category.total / categoryMax) * 100}%` }} /></div>
            <div className="cshare">
              {report.expense ? Math.round((category.total / report.expense) * 100) : 0}% {t('reports.ofSpending')}
            </div>
            <button
              type="button"
              className="budget-transactions-toggle"
              aria-expanded={expanded}
              onClick={() => setExpandedCategoryName((currentName) => currentName === category.name ? null : category.name)}
            >
              <span>{linkedTransactions.length} {t('budget.transactions')}</span>
              <Chevron />
            </button>
            {expanded && (
              <div className="budget-transactions">
                {linkedTransactions.length === 0 ? (
                  <span className="budget-transactions-empty">{t('budget.noTransactions')}</span>
                ) : linkedTransactions.map((transaction) => (
                  <button
                    type="button"
                    className="budget-transaction"
                    key={transaction.id}
                    onClick={() => ui.openItem(transactionTitle(transaction), 'transaksi', transaction.id)}
                  >
                    <span><b>{transactionTitle(transaction)}</b><small>{transactionDate(transaction.date)}</small></span>
                    <b>{money.fmt(transaction.amount)}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
          );
        })}
      </div>

      {report.isActive ? (
        <>
          <div className="sec"><span className="t">{t('period.closeSection')}</span></div>
          {!asking ? (
            <>
              <div className="note"><Info /><span>{t('closing.dataNote')}</span></div>
              <button
                className="cta"
                onClick={() => {
                  const firstDraft = followingDrafts[0];
                  setCopyBudgetIds(report.budgets.map((budget) => budget.id));
                  setNextAlias('');
                  setNextChoice(firstDraft ? 'draft' : 'new');
                  setTargetDraftId(firstDraft?.id ?? '');
                  setAsking(true);
                }}
              >
                <Lock />{t('period.closeCta', { name: current.alias })}
              </button>
            </>
          ) : (
            <div className="close-choice">
              <div className="closing-steps">
                <div>
                  <span className="step-number"><Check /></span>
                  <p><b>{t('closing.lockAll')}</b><small>{t('closing.lockAllDesc')}</small></p>
                  <strong>{report.txCount} {t('reports.txCount')}</strong>
                </div>
                <div>
                  <span className="step-number"><Check /></span>
                  <p><b>{t('closing.computeSurplus')}</b><small>{t('closing.computeSurplusDesc')}</small></p>
                  <strong className={report.safeToSpend < 0 ? 'negative' : undefined}>
                    {money.fmtSigned(report.safeToSpend)}
                  </strong>
                </div>
              </div>

              <label className="confirm-box">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>{t('closing.confirm')}</span>
              </label>

              <p className="close-question">{t('period.askNext')}</p>
              {followingDrafts.length > 0 && (
                <div className="period-next-options" role="group" aria-label={t('closing.nextOptionLabel')}>
                  <button
                    type="button"
                    className={nextChoice === 'draft' ? 'on' : ''}
                    aria-pressed={nextChoice === 'draft'}
                    onClick={() => setNextChoice('draft')}
                  >
                    {t('closing.useDraft')}
                  </button>
                  <button
                    type="button"
                    className={nextChoice === 'new' ? 'on' : ''}
                    aria-pressed={nextChoice === 'new'}
                    onClick={() => setNextChoice('new')}
                  >
                    {t('closing.createNew')}
                  </button>
                </div>
              )}
              <div className="period-switch">
                <div className="ps-card closing">
                  <span>{t('closing.periodClosed')}</span>
                  <b>{current.alias}</b>
                  <small>{range(current.start, current.end)}</small>
                </div>
                <div className="ps-arrow" aria-hidden>→</div>
                <div className="ps-card opening">
                  <span>{t(nextChoice === 'draft' ? 'closing.draftOpened' : 'closing.periodOpened')}</span>
                  {nextChoice === 'draft' ? (
                    followingDrafts.length > 1 ? (
                      <select
                        value={targetDraftId}
                        onChange={(event) => setTargetDraftId(event.target.value)}
                        aria-label={t('closing.chooseDraft')}
                      >
                        {followingDrafts.map((draft) => (
                          <option key={draft.id} value={draft.id}>{draft.alias}</option>
                        ))}
                      </select>
                    ) : (
                      <b>{targetDraft?.alias}</b>
                    )
                  ) : (
                    <input
                      value={nextAlias}
                      onChange={(event) => setNextAlias(event.target.value)}
                      placeholder={t('closing.nextNamePlaceholder')}
                      aria-label={t('closing.nextNameLabel')}
                      maxLength={80}
                      autoComplete="off"
                      autoFocus
                    />
                  )}
                  <small>{nextChoice === 'draft' ? range(targetDraft?.start, targetDraft?.end) : range(nextStart, nextEnd)}</small>
                </div>
              </div>

              {nextChoice === 'draft' && (
                <div className="note"><Info /><span>{t('closing.useDraftNote')}</span></div>
              )}

              {report.budgets.length > 0 ? (
                <div className="budget-copy-picker">
                  <div className="budget-copy-head">
                    <div>
                      <b>{t('closing.copyBudgetsTitle')}</b>
                      <small>{t(nextChoice === 'draft' ? 'closing.copyBudgetsDraftDesc' : 'closing.copyBudgetsDesc')}</small>
                    </div>
                    <span>{t('closing.selectedBudgets', {
                      selected: copyBudgetIds.length,
                      total: report.budgets.length,
                    })}</span>
                  </div>
                  <label className="budget-copy-all">
                    <input
                      type="checkbox"
                      checked={copyBudgetIds.length === report.budgets.length}
                      onChange={(event) => setCopyBudgetIds(
                        event.target.checked ? report.budgets.map((budget) => budget.id) : [],
                      )}
                    />
                    <span>{t('closing.selectAllBudgets')}</span>
                  </label>
                  <div className="budget-copy-list">
                    {report.budgets.map((budget) => (
                      <label key={budget.id}>
                        <input
                          type="checkbox"
                          checked={copyBudgetIds.includes(budget.id)}
                          onChange={(event) => setCopyBudgetIds((currentIds) =>
                            event.target.checked
                              ? [...currentIds, budget.id]
                              : currentIds.filter((id) => id !== budget.id),
                          )}
                        />
                        <span>{budget.category}</span>
                        <b>{money.fmt(budget.allocated)}</b>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="note"><Info /><span>{t('closing.noBudgetsToCopy')}</span></div>
              )}

              <button
                className="cta"
                disabled={!confirmed || (nextChoice === 'new' ? !nextAlias.trim() : !targetDraft) || closing}
                onClick={() => void closePeriod(nextChoice)}
              >
                {closing
                  ? t('closing.closing')
                  : nextChoice === 'draft' && targetDraft
                    ? t('closing.ctaDraft', { from: current.alias, to: targetDraft.alias })
                    : nextAlias.trim()
                    ? t('closing.ctaNamed', { from: current.alias, to: nextAlias.trim() })
                    : t('closing.ctaUnnamed', { from: current.alias })}
              </button>
              <button
                className="ghost-cta"
                disabled={!confirmed || closing}
                onClick={() => void closePeriod('none')}
              >
                {t('period.closeOnly')}
              </button>
              <button
                className="ghost-cta subtle"
                disabled={closing}
                onClick={() => { setAsking(false); setConfirmed(false); setNextAlias(''); setTargetDraftId(''); setCopyBudgetIds([]); }}
              >
                {t('common.cancel')}
              </button>
              <div className="note"><Info /><span>{t('period.closeOnlyNote')}</span></div>
            </div>
          )}
        </>
      ) : isDraft ? (
        <>
          <div className="sec"><span className="t">{t('period.openSection')}</span></div>
          <div className="note">
            <Info />
            <span>{t(canOpenDraft ? 'period.openNote' : 'period.openBlockedNote')}</span>
          </div>
          {canOpenDraft && (
            <button className="cta" disabled={opening} onClick={() => void openPeriod()}>
              <Calendar />{t(opening ? 'period.opening' : 'period.openCta', { name: current.alias })}
            </button>
          )}
        </>
      ) : (
        <div className="note">
          <Lock />
          <span>{t('period.archivedNote')}</span>
        </div>
      )}
    </>
  );
}
