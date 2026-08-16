'use client';
import React, { useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useReceivables, useTransactions, useWallets } from '../application/hooks';
import { Check, Info, Plus, Up } from '../components/ui/icons';
import { useRepositories } from '../infrastructure/RepositoryProvider';

type SettlementDraft = {
  receivableId: string;
  person: string;
  amount: number;
  walletId: string;
  date: string;
  note: string;
};

const dateInputValue = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export default function ReceivablesScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const repos = useRepositories();
  const { active, settled } = useReceivables();
  const { data: transactions } = useTransactions();
  const { wallets } = useWallets();
  const [done, setDone] = useState<string[]>([]);
  const [settlement, setSettlement] = useState<SettlementDraft | null>(null);
  const [settling, setSettling] = useState(false);
  const unpaid = active.filter(r => !done.includes(r.id));
  const outstanding = unpaid.reduce((sum, r) => sum + (r.amount - (r.paid ?? 0)), 0);
  const destinationWallets = wallets.filter(wallet => wallet.kind === 'debit');

  // Pemasukan yang menandai pelunasan — dipakai untuk menunjukkan bukti transaksinya.
  const settlingTx = new Map(
    transactions.filter(tx => tx.settlesReceivableId).map(tx => [tx.settlesReceivableId as string, tx]),
  );
  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const openSettlement = (id: string, person: string, amount: number) => {
    const walletId = destinationWallets.find(wallet => wallet.id === ui.prefs.defaultWalletId)?.id
      ?? destinationWallets[0]?.id;
    if (!walletId) {
      ui.notify(t('piutang.missingWallet'));
      return;
    }
    setSettlement({
      receivableId: id,
      person,
      amount,
      walletId,
      date: dateInputValue(),
      note: `Pelunasan piutang ${person}`,
    });
  };

  const settleNow = async () => {
    if (!settlement) return;
    setSettling(true);
    try {
      await repos.commands.settleReceivable(settlement.receivableId, {
        walletId: settlement.walletId,
        occurredAt: new Date(`${settlement.date}T12:00:00`).toISOString(),
        note: settlement.note,
      });
      setDone((current) => [...current, settlement.receivableId]);
      setSettlement(null);
      ui.refresh();
      ui.notify(t('piutang.settledToast', { name: settlement.person }));
    } catch (caught) {
      ui.notify(caught instanceof Error ? caught.message : 'Pelunasan piutang gagal');
    } finally {
      setSettling(false);
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
              <button className="settle" onClick={(e) => { e.stopPropagation(); openSettlement(r.id, r.person, left); }}>
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
      {settlement && (
        <div className="settlement-scrim" onClick={() => !settling && setSettlement(null)}>
          <section
            className="settlement-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settlement-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grab" />
            <h3 id="settlement-title">{t('piutang.settleDialogTitle')}</h3>
            <p>{t('piutang.settleDialogBody', { name: settlement.person })}</p>
            <div className="settlement-amount">
              <span>{t('piutang.settleAmount')}</span>
              <b>{money.fmt(settlement.amount)}</b>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void settleNow(); }}>
              <label className="settlement-field">
                <span>{t('piutang.settleDate')}</span>
                <input
                  type="date"
                  value={settlement.date}
                  onClick={(event) => {
                    try { event.currentTarget.showPicker(); } catch { /* native fallback */ }
                  }}
                  onChange={(event) => setSettlement({ ...settlement, date: event.target.value })}
                  required
                />
              </label>
              <label className="settlement-field">
                <span>{t('piutang.settleWallet')}</span>
                <select
                  value={settlement.walletId}
                  onChange={(event) => setSettlement({ ...settlement, walletId: event.target.value })}
                >
                  {destinationWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                </select>
              </label>
              <label className="settlement-field">
                <span>{t('piutang.settleNote')}</span>
                <input
                  value={settlement.note}
                  onChange={(event) => setSettlement({ ...settlement, note: event.target.value })}
                />
              </label>
              <div className="settlement-actions">
                <button type="button" className="settlement-cancel" disabled={settling} onClick={() => setSettlement(null)}>
                  {t('common.cancel')}
                </button>
                <button className="cta compact" disabled={settling}>
                  {settling ? t('common.saving') : t('piutang.settleConfirm')}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
