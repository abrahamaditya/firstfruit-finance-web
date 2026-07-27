'use client';

import React, { useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useDashboard, usePeriods } from '../application/hooks';
import { useRepositories } from '../infrastructure/RepositoryProvider';
import { Check, Info, Lock, Plus, TrendUp } from '../components/ui/icons';

export default function ClosingScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const repos = useRepositories();
  const dashboard = useDashboard();
  const { periods } = usePeriods();
  const [confirmed, setConfirmed] = useState(false);
  const [closing, setClosing] = useState(false);

  // Periode berikutnya dihitung di sini juga supaya bisa ditampilkan sebelum tombol ditekan
  // — jadi jelas bulan apa yang ditutup dan bulan apa yang dibuka.
  const current = dashboard.period;
  const nextStart = current ? new Date(current.end) : null;
  nextStart?.setDate(nextStart.getDate() + 1);
  const nextEnd = nextStart ? new Date(nextStart) : null;
  if (nextEnd) { nextEnd.setMonth(nextEnd.getMonth() + 1); nextEnd.setDate(nextEnd.getDate() - 1); }
  const nextAlias = nextStart
    ? `${t('closing.periodPrefix')} ${nextStart.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}`
    : '';
  const periodLength = (from: string, to: string) =>
    Math.max(1, Math.round((+new Date(to) - +new Date(from)) / 86_400_000));
  const range = (from?: Date | string | null, to?: Date | string | null) =>
    from && to
      ? `${new Date(from).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(to).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : '';

  const closePeriod = async () => {
    if (!current || !nextStart || !nextEnd) return;
    setClosing(true);
    try {
      await repos.commands.closePeriod(current.id, nextAlias);
      ui.refresh();
      ui.notify(t('closing.transition', { from: current.alias, to: nextAlias }));
      ui.go('home');
    } catch (caught) {
      ui.notify(caught instanceof Error ? caught.message : 'Periode gagal ditutup');
    } finally {
      setClosing(false);
    }
  };

  return (
    <>
      <div className="closing-hero">
        <div className="closing-icon"><Lock /></div>
        <div><span>{t('closing.netSurplus')} · {dashboard.period?.alias}</span><strong>{money.fmt(dashboard.netSurplus)}</strong><small><TrendUp /> {t('closing.becomesOpening')}</small></div>
      </div>

      <div className="sec"><span className="t">{t('closing.whatHappens')}</span></div>
      <div className="period-switch">
        <div className="ps-card closing">
          <span>{t('closing.periodClosed')}</span>
          <b>{current?.alias ?? '—'}</b>
          <small>{range(current?.start, current?.end)}</small>
        </div>
        <div className="ps-arrow" aria-hidden>→</div>
        <div className="ps-card opening">
          <span>{t('closing.periodOpened')}</span>
          <b>{nextAlias || '—'}</b>
          <small>{range(nextStart, nextEnd)}</small>
        </div>
      </div>

      <div className="sec"><span className="t">{t('closing.summary')}</span></div>
      <div className="closing-steps">
        <div><span className="step-number"><Check /></span><p><b>{t('closing.lockAll')}</b><small>{t('closing.lockAllDesc')}</small></p><strong>{t('closing.done')}</strong></div>
        <div><span className="step-number"><Check /></span><p><b>{t('closing.computeSurplus')}</b><small>{t('closing.computeSurplusDesc')}</small></p><strong>{money.fmt(dashboard.netSurplus)}</strong></div>
        <div><span className="step-number">3</span><p><b>{t('closing.nextPeriod')}</b><small>{nextAlias || t('closing.nextPeriodDesc')}</small></p><strong>{t('closing.auto')}</strong></div>
      </div>

      {/* Riwayat periode: yang aktif di atas, arsip di bawahnya. */}
      <div className="sec">
        <span className="t">{t('closing.periodList')}</span>
        <button className="addg" onClick={() => ui.openCreate('periode')}><Plus />{t('common.add')}</button>
      </div>
      <div className="card period-list">
        {periods.length === 0 && <div className="saving-empty">{t('closing.noPeriods')}</div>}
        {periods.map((item) => (
          <div className="period-row" key={item.id} onClick={() => ui.openItem(item.alias, 'periode', item.id)}>
            <div className="pr-main">
              <div className="pr-name">
                {item.alias}
                <span className={`pstatus ${item.status === 'open' ? 'active' : 'draft'}`}>
                  {item.status === 'draft'
                    ? 'Draft'
                    : item.closed ? t('closing.statusClosed') : t('closing.statusActive')}
                </span>
              </div>
              <div className="pr-range">{range(item.start, item.end)}</div>
            </div>
            <div className="pr-days">{periodLength(item.start, item.end)} {t('closing.daysUnit')}</div>
          </div>
        ))}
      </div>

      <div className="note"><Info /><span>{t('closing.dataNote')}</span></div>
      <label className="confirm-box">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>{t('closing.confirm')}</span>
      </label>
      <button className="cta" disabled={!confirmed || closing} onClick={() => void closePeriod()}>
        {closing ? t('closing.closing') : t('closing.ctaNamed', { from: current?.alias ?? '', to: nextAlias })}
      </button>
    </>
  );
}
