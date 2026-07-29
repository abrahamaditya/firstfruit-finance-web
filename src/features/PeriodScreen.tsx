'use client';

import React, { useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { usePeriodReport } from '../application/hooks';
import { useRepositories } from '../infrastructure/RepositoryProvider';
import { Calendar, Check, Info, ListIcon, Lock, Plus } from '../components/ui/icons';

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
  // Tutup buku dua langkah: tombolnya cuma membuka pilihan, keputusan "buat periode
  // berikutnya atau tidak" dijawab setelah kotak konfirmasi dicentang.
  const [asking, setAsking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [closing, setClosing] = useState(false);

  const current = report.period;
  // Tiga keadaan, bukan dua: draft belum pernah berjalan, jadi ia tidak bisa ditutup
  // dan juga bukan arsip.
  const isDraft = current?.status === 'draft';

  // Periode berikutnya dihitung di sini juga supaya namanya bisa ditunjukkan sebelum
  // tombolnya ditekan — jelas bulan apa yang ditutup dan bulan apa yang dibuka.
  const nextStart = current ? new Date(current.end) : null;
  nextStart?.setDate(nextStart.getDate() + 1);
  const nextEnd = nextStart ? new Date(nextStart) : null;
  if (nextEnd) { nextEnd.setMonth(nextEnd.getMonth() + 1); nextEnd.setDate(nextEnd.getDate() - 1); }
  const nextAlias = nextStart
    ? `${t('closing.periodPrefix')} ${nextStart.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}`
    : '';
  const range = (from?: Date | string | null, to?: Date | string | null) =>
    from && to
      ? `${new Date(from).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(to).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : '';

  const closePeriod = async (createNext: boolean) => {
    if (!current) return;
    setClosing(true);
    try {
      await repos.commands.closePeriod(current.id, { createNext, nextAlias });
      // Periode yang barusan ditutup tidak lagi jadi pilihan aktif — biarkan layar
      // kembali ke periode berjalan (kalau ada) lewat pilihan kosong.
      ui.selectPeriod(null);
      ui.refresh();
      ui.notify(createNext
        ? t('closing.transition', { from: current.alias, to: nextAlias })
        : t('closing.closedOnly', { name: current.alias }));
      setAsking(false);
      setConfirmed(false);
      if (createNext) ui.go('home');
    } catch (caught) {
      ui.notify(caught instanceof Error ? caught.message : 'Periode gagal ditutup');
    } finally {
      setClosing(false);
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

      <div className="metric-grid">
        <div className="metric-card m-in">
          <span>{t('reports.income')}</span>
          <b>{money.fmtCompact(report.income)}</b>
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
        {report.budgets.map((budget) => (
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
          </div>
        ))}
      </div>

      <div className="sec"><span className="t">{t('reports.topCategories')}</span></div>
      <div className="cat-card">
        {report.categories.length === 0 && <div className="saving-empty">{t('reports.noData')}</div>}
        {report.categories.map((category) => (
          <div className="cb" key={category.name}>
            <div className="crow">
              <span className="cn">{category.name}</span>
              <span className="cv2">{money.fmt(category.total)}</span>
            </div>
            <div className="cbar"><i style={{ width: `${(category.total / categoryMax) * 100}%` }} /></div>
            <div className="cshare">
              {report.expense ? Math.round((category.total / report.expense) * 100) : 0}% {t('reports.ofSpending')}
            </div>
          </div>
        ))}
      </div>

      {report.isActive ? (
        <>
          <div className="sec"><span className="t">{t('period.closeSection')}</span></div>
          {!asking ? (
            <>
              <div className="note"><Info /><span>{t('closing.dataNote')}</span></div>
              <button className="cta" onClick={() => setAsking(true)}>
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
              <div className="period-switch">
                <div className="ps-card closing">
                  <span>{t('closing.periodClosed')}</span>
                  <b>{current.alias}</b>
                  <small>{range(current.start, current.end)}</small>
                </div>
                <div className="ps-arrow" aria-hidden>→</div>
                <div className="ps-card opening">
                  <span>{t('closing.periodOpened')}</span>
                  <b>{nextAlias}</b>
                  <small>{range(nextStart, nextEnd)}</small>
                </div>
              </div>

              <button
                className="cta"
                disabled={!confirmed || closing}
                onClick={() => void closePeriod(true)}
              >
                {closing ? t('closing.closing') : t('closing.ctaNamed', { from: current.alias, to: nextAlias })}
              </button>
              <button
                className="ghost-cta"
                disabled={!confirmed || closing}
                onClick={() => void closePeriod(false)}
              >
                {t('period.closeOnly')}
              </button>
              <button
                className="ghost-cta subtle"
                disabled={closing}
                onClick={() => { setAsking(false); setConfirmed(false); }}
              >
                {t('common.cancel')}
              </button>
              <div className="note"><Info /><span>{t('period.closeOnlyNote')}</span></div>
            </div>
          )}
        </>
      ) : (
        <div className="note">
          {isDraft ? <Info /> : <Lock />}
          <span>{t(isDraft ? 'period.draftNote' : 'period.archivedNote')}</span>
        </div>
      )}
    </>
  );
}
