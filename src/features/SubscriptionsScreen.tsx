'use client';
import React, { useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useSubscriptions } from '../application/hooks';
import { Warn, Clock, Plus } from '../components/ui/icons';

const color: Record<string, string> = { 'Netflix Premium': '#e50914', 'Spotify Premium': '#1db954', 'Membership Gym': '#7c5cff', 'iCloud+ 200GB': '#0071e3', 'Domain & Hosting': '#2F4858' };

export default function SubscriptionsScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const { subs, monthlyBurden } = useSubscriptions();
  // Hitungan hari saja bikin orang harus mengira-ngira — tanggal aslinya ikut ditulis.
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const [filter, setFilter] = useState<'all' | 'soon' | 'yearly'>('all');
  const active = subs.filter(s => s.status === 'active');
  const billingSoon = active.filter(s => s.reminderDue);
  const endingSoon = active.filter(s => s.endingSoon);
  const visible = active.filter(s =>
    filter === 'all' ||
    (filter === 'soon' && (s.daysToBilling <= 14 || s.endingSoon)) ||
    (filter === 'yearly' && s.cycle === 'yearly'),
  );

  return (
    <>
      <div className="shero">
        <div className="sl">{t('subs.totalBurden')}</div>
        <div className="sa">{money.fmt(monthlyBurden)}<span style={{ fontSize: 15, color: 'var(--ink-soft)', fontWeight: 600 }}> {t('subs.perMonth')}</span></div>
        <div className="sp"><Clock /> {active.length} {t('subs.activeCount')} · {money.fmtCompact(monthlyBurden * 12)}{t('subs.perYear')}</div>
      </div>

      {(billingSoon.length > 0 || endingSoon.length > 0) && <div className="sec"><span className="t">{t('subs.needAttention')}</span></div>}
      {billingSoon.map(s => (
        <div className="alert warn" key={'b' + s.id}><div className="ai"><Warn /></div>
          <div className="am"><div className="at">{s.name} {t('subs.willBill')}</div><div className="ad">{money.fmt(s.amount)} · {fmtDate(s.nextBillingDate)}</div></div>
          <div className="av" style={{ color: 'var(--neg)' }}>{s.daysToBilling} {t('subs.daysShort')}</div></div>
      ))}
      {endingSoon.map(s => (
        <div className="alert soon" key={'e' + s.id}><div className="ai"><Clock /></div>
          <div className="am"><div className="at">{s.name} {t('subs.willEnd')}</div><div className="ad">{fmtDate(s.endDate)} · {t('subs.considerRenew')}</div></div>
          <div className="av" style={{ color: 'var(--mint)' }}>{s.daysToEnd} {t('subs.daysShort')}</div></div>
      ))}

      <div className="sec"><span className="t">{t('subs.all')}</span><button className="addg" onClick={() => ui.openCreate('subscription')}><Plus />{t('common.add')}</button></div>
      <div className="filter-pills">
        {[['all', t('subs.fAll')], ['soon', t('subs.fSoon')], ['yearly', t('subs.fYearly')]].map(([value, label]) => (
          <button key={value} className={filter === value ? 'on' : ''} onClick={() => setFilter(value as typeof filter)}>{label}</button>
        ))}
      </div>
      {visible.map(s => (
        <div className="row sub" key={s.id} onClick={() => ui.openItem(s.name, 'subscription', s.id)}>
          <div className="lg" style={{ background: color[s.name] || '#444' }}>{s.name[0]}</div>
          <div className="mid">
            <div className="t1">{s.name}</div>
            <div className="t2">
              {s.endDate
                ? <><span className="dot-end" />{t('subs.endingIn', { n: s.daysToEnd ?? 0 })} · {fmtDate(s.endDate)}</>
                : t('subs.monthlyBilledIn', { n: s.daysToBilling })}
            </div>
          </div>
          <div className="r"><div className="val">{money.fmt(s.amount)}</div><div className="subt">{t('subs.nextBill')} {fmtDate(s.nextBillingDate)}</div></div>
        </div>
      ))}
      {visible.length === 0 && <div className="empty-state"><Clock /><b>{t('subs.emptyTitle')}</b><span>{t('subs.emptyBody')}</span></div>}
    </>
  );
}
