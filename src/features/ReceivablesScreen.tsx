'use client';
import React, { useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useReceivables, useTransactions } from '../application/hooks';
import { Check, Info, Plus, Up } from '../components/ui/icons';
import { useRepositories } from '../infrastructure/RepositoryProvider';

export default function ReceivablesScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const repos = useRepositories();
  const { active, settled } = useReceivables();
  const { data: transactions } = useTransactions();
  const [done, setDone] = useState<string[]>([]);
  const unpaid = active.filter(r => !done.includes(r.id));
  const outstanding = unpaid.reduce((sum, r) => sum + (r.amount - (r.paid ?? 0)), 0);

  // Pemasukan yang menandai pelunasan — dipakai untuk menunjukkan bukti transaksinya.
  const settlingTx = new Map(
    transactions.filter(tx => tx.settlesReceivableId).map(tx => [tx.settlesReceivableId as string, tx]),
  );
  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const settleNow = async (id: string, person: string) => {
    try {
      await repos.commands.settleReceivable(id, ui.prefs.defaultWalletId || undefined);
      setDone([...done, id]);
      ui.refresh();
      ui.notify(t('piutang.settledToast', { name: person }));
    } catch (caught) {
      ui.notify(caught instanceof Error ? caught.message : 'Pelunasan piutang gagal');
    }
  };

  return (
    <>
      <div className="shero">
        <div className="sl">{t('piutang.totalActive')}</div>
        <div className="sa">{money.fmt(outstanding)}</div>
        <div className="sp"><Check /> {unpaid.length} {t('piutang.peopleOweYou')}</div>
      </div>

      <div className="note"><Info /><span>{t('piutang.autoNote')}</span></div>

      <div className="sec"><span className="t">{t('piutang.unpaid')}</span><button className="addg" onClick={() => ui.openCreate('piutang')}><Plus />{t('common.add')}</button></div>
      {unpaid.length === 0 && <div className="saving-empty">{t('piutang.allClear')}</div>}
      {unpaid.map(r => {
        const paid = r.paid ?? 0;
        const left = r.amount - paid;
        return (
          <div className="row" key={r.id} onClick={() => ui.openItem(r.person, 'piutang', r.id)}>
            <div className="lg" style={{ background: '#2F4858' }}>{r.person[0]}</div>
            <div className="mid">
              <div className="t1">{r.person}</div>
              <div className="t2">
                {r.source}
                {paid > 0 && <span className="chip">{t('piutang.partial', { paid: money.fmtCompact(paid) })}</span>}
              </div>
            </div>
            <div className="r">
              <div className="val">{money.fmt(left)}</div>
              <button className="settle" onClick={(e) => { e.stopPropagation(); void settleNow(r.id, r.person); }}>
                {t('piutang.settle')}
              </button>
            </div>
          </div>
        );
      })}

      <div className="sec"><span className="t">{t('piutang.paid')}</span></div>
      {[...settled, ...active.filter(r => done.includes(r.id))].map(r => {
        const tx = settlingTx.get(r.id);
        return (
          <div className="row done" key={r.id} onClick={() => tx && ui.openItem(tx.note || tx.labels.at(-1) || '', 'transaksi', tx.id)}>
            <div className="lg" style={{ background: 'var(--ink-faint)' }}>{r.person[0]}</div>
            <div className="mid">
              <div className="t1">{r.person}</div>
              <div className="t2">
                {r.source}
                {/* Kalau lunasnya karena sebuah transaksi pemasukan, tunjukkan tautannya. */}
                {tx && <span className="chip"><Up /> {tx.note}</span>}
                {r.settledAt && <span className="chip">{fmtDate(r.settledAt)}</span>}
              </div>
            </div>
            <div className="r"><div className="val">{money.fmt(r.amount)}</div></div>
          </div>
        );
      })}
    </>
  );
}
