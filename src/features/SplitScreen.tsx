'use client';

import React, { useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useRepositories } from '../infrastructure/RepositoryProvider';
import {
  Receipt, SplitItem, SplitPerson,
  balances, itemTotal, receiptSubtotal, receiptTax, receiptTotal, settlements, shareOfReceipt,
} from '../core/domain/split';
import { Check, Info, Plus, Trash } from '../components/ui/icons';

const ME = 'me';
const PALETTE = ['#2F4858', '#C76D3A', '#9B6B43', '#4c2a86', '#0a8cd4', '#00786a'];
const uid = () => Math.random().toString(36).slice(2, 9);

const initialPeople: SplitPerson[] = [
  { id: ME, name: 'Saya', color: 'var(--emerald)' },
  { id: 'budi', name: 'Budi', color: PALETTE[0] },
  { id: 'citra', name: 'Citra', color: PALETTE[1] },
];

const newItem = (people: SplitPerson[]): SplitItem => ({
  id: uid(), name: '', price: 0, sharedBy: people.map((person) => person.id),
});

export default function SplitScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const numLocale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const repos = useRepositories();
  const [people, setPeople] = useState<SplitPerson[]>(initialPeople);
  const [receipts, setReceipts] = useState<Receipt[]>([
    { id: uid(), name: 'Nota 1', payerId: ME, taxPercent: 0, items: [newItem(initialPeople)] },
  ]);
  const [openReceipt, setOpenReceipt] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);

  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? '?';
  const grandTotal = receipts.reduce((sum, receipt) => sum + receiptTotal(receipt), 0);
  const totalTax = receipts.reduce((sum, receipt) => sum + receiptTax(receipt), 0);
  const personBalances = balances(receipts, people);
  const transfers = settlements(personBalances);
  // Piutang hanya dibuat untuk yang harus mengirim uang KE saya.
  const owedToMe = transfers.filter((transfer) => transfer.toId === ME);

  const patchReceipt = (id: string, patch: Partial<Receipt>) =>
    setReceipts((current) => current.map((receipt) => (receipt.id === id ? { ...receipt, ...patch } : receipt)));
  const patchItem = (receiptId: string, itemId: string, patch: Partial<SplitItem>) =>
    setReceipts((current) =>
      current.map((receipt) =>
        receipt.id === receiptId
          ? { ...receipt, items: receipt.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }
          : receipt,
      ),
    );

  const addReceipt = () => {
    const receipt: Receipt = { id: uid(), name: `Nota ${receipts.length + 1}`, payerId: ME, taxPercent: 0, items: [newItem(people)] };
    setReceipts([...receipts, receipt]);
    setOpenReceipt(receipt.id);
  };

  const addPerson = () => {
    const name = newName.trim();
    if (!name) return;
    const person: SplitPerson = { id: uid(), name, color: PALETTE[people.length % PALETTE.length] };
    setPeople([...people, person]);
    setNewName('');
    setAdding(false);
    ui.notify(t('split.personAdded'));
  };

  const removePerson = (id: string) => {
    setPeople(people.filter((person) => person.id !== id));
    setReceipts(receipts.map((receipt) => ({
      ...receipt,
      payerId: receipt.payerId === id ? ME : receipt.payerId,
      items: receipt.items.map((item) => ({ ...item, sharedBy: item.sharedBy.filter((personId) => personId !== id) })),
    })));
  };

  const toggleShare = (receiptId: string, item: SplitItem, personId: string) =>
    patchItem(receiptId, item.id, {
      sharedBy: item.sharedBy.includes(personId)
        ? item.sharedBy.filter((entry) => entry !== personId)
        : [...item.sharedBy, personId],
    });

  const createReceivables = async () => {
    setCreating(true);
    try {
      await repos.commands.finalizeSplitBill(
        `Split bill · ${receipts.length} nota`,
        people,
        receipts,
      );
      ui.refresh();
      ui.notify(t('split.created', { n: owedToMe.length }));
      ui.go('piutang');
    } catch (caught) {
      ui.notify(caught instanceof Error ? caught.message : 'Split bill gagal dibuat');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="bill-total">
        <div className="lbl">{t('split.billTotal')}</div>
        <div className="amt">{money.fmt(grandTotal)}</div>
        <div className="bill-meta">
          <span>{t('split.receiptCount', { n: receipts.length })}</span>
          <span>·</span>
          <span>{t('split.taxTotal')} {money.fmt(totalTax)}</span>
        </div>
      </div>

      <div className="sec">
        <span className="t">{t('split.people')}</span>
        <button className="addg" onClick={() => setAdding(true)}><Plus />{t('split.person')}</button>
      </div>
      {adding && (
        <div className="inline-add">
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={t('split.newPersonPlaceholder')} onKeyDown={(event) => event.key === 'Enter' && addPerson()} />
          <button onClick={addPerson}><Check /></button>
        </div>
      )}
      <div className="people-strip">
        {people.map((person) => (
          <span className="person-chip" key={person.id}>
            <i style={{ background: person.color }}>{person.name[0]}</i>
            {person.name}
            {person.id !== ME && (
              <button onClick={() => removePerson(person.id)} aria-label={`Hapus ${person.name}`}>×</button>
            )}
          </span>
        ))}
      </div>

      <div className="sec">
        <span className="t">{t('split.receipts')}</span>
        <button className="addg" onClick={addReceipt}><Plus />{t('split.receipt')}</button>
      </div>

      {receipts.map((receipt) => {
        const open = openReceipt === receipt.id;
        return (
          <div className={`receipt-card${open ? ' open' : ''}`} key={receipt.id}>
            <div className="receipt-head">
              <input
                className="receipt-name"
                value={receipt.name}
                onChange={(event) => patchReceipt(receipt.id, { name: event.target.value })}
                placeholder={t('split.receiptNamePlaceholder')}
              />
              <div className="receipt-sum">
                <b>{money.fmt(receiptTotal(receipt))}</b>
                <small>{receipt.items.length} {t('split.items')}</small>
              </div>
              <button className="row-delete" onClick={() => setReceipts(receipts.filter((entry) => entry.id !== receipt.id))} aria-label={`Hapus ${receipt.name}`}><Trash /></button>
            </div>

            <div className="receipt-payer">
              <span>{t('split.paidBy')}</span>
              <div className="payer-pills">
                {people.map((person) => (
                  <button
                    key={person.id}
                    className={receipt.payerId === person.id ? 'on' : ''}
                    onClick={() => patchReceipt(receipt.id, { payerId: person.id })}
                  >
                    {person.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Pajak/servis satu nilai untuk seluruh nota, lalu disebar ke tiap item. */}
            <div className="receipt-tax">
              <span>{t('split.taxLabel')}</span>
              <div className="si-tax">
                <input
                  inputMode="decimal"
                  value={receipt.taxPercent || ''}
                  onChange={(event) => patchReceipt(receipt.id, { taxPercent: Number(event.target.value.replace(/[^\d.]/g, '')) || 0 })}
                  placeholder="0"
                  aria-label={t('split.taxPercent')}
                />
                <span>%</span>
              </div>
              <em>{money.fmt(receiptTax(receipt))}</em>
            </div>

            <button className="receipt-toggle" onClick={() => setOpenReceipt(open ? null : receipt.id)}>
              {open ? t('split.hideItems') : t('split.showItems')} · {money.fmt(receiptSubtotal(receipt))} + {t('split.tax')} {money.fmt(receiptTax(receipt))}
            </button>

            {open && (
              <>
                {receipt.items.map((item) => (
                  <div className="split-item" key={item.id}>
                    <div className="split-item-top">
                      <input
                        className="si-name"
                        value={item.name}
                        onChange={(event) => patchItem(receipt.id, item.id, { name: event.target.value })}
                        placeholder={t('split.itemPlaceholder')}
                      />
                      <div className="si-price">
                        <span>Rp</span>
                        <input
                          inputMode="numeric"
                          value={item.price ? item.price.toLocaleString(numLocale) : ''}
                          onChange={(event) => patchItem(receipt.id, item.id, { price: Number(event.target.value.replace(/\D/g, '')) || 0 })}
                          placeholder="0"
                        />
                      </div>
                      <button className="row-delete" onClick={() => patchReceipt(receipt.id, { items: receipt.items.filter((entry) => entry.id !== item.id) })} aria-label="Hapus item"><Trash /></button>
                    </div>
                    <div className="si-share">
                      {people.map((person) => (
                        <button
                          key={person.id}
                          className={item.sharedBy.includes(person.id) ? 'on' : ''}
                          onClick={() => toggleShare(receipt.id, item, person.id)}
                        >
                          {person.name}
                        </button>
                      ))}
                      <span className="si-total">{money.fmt(itemTotal(item, receipt.taxPercent))}</span>
                    </div>
                  </div>
                ))}
                <button className="addg receipt-add-item" onClick={() => patchReceipt(receipt.id, { items: [...receipt.items, newItem(people)] })}>
                  <Plus />{t('split.addItem')}
                </button>
                <div className="receipt-breakdown">
                  {[...shareOfReceipt(receipt).entries()].map(([personId, amount]) => (
                    <div key={personId}><span>{nameOf(personId)}</span><b>{money.fmt(amount)}</b></div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      <div className="sec"><span className="t">{t('split.result')}</span></div>
      <div className="card">
        {personBalances.map((balance) => (
          <div className="bline" key={balance.personId}>
            <div className="brow">
              <span className="nm">{nameOf(balance.personId)}</span>
              <span className={`amt ${balance.net >= 0 ? 'positive' : 'negative'}`}>
                {balance.net >= 0 ? '+' : ''}{money.fmt(balance.net)}
              </span>
            </div>
            <div className="budget-foot">
              <span>{t('split.consumed')} {money.fmt(balance.owes)}</span>
              <span>{t('split.fronted')} {money.fmt(balance.paid)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="sec"><span className="t">{t('split.transfers')}</span></div>
      {transfers.length === 0 && <div className="saving-empty">{t('split.settled')}</div>}
      {transfers.map((transfer, index) => (
        <div className="row" key={index}>
          <div className="lg" style={{ background: people.find((person) => person.id === transfer.fromId)?.color || '#444' }}>
            {nameOf(transfer.fromId)[0]}
          </div>
          <div className="mid">
            <div className="t1">{nameOf(transfer.fromId)} → {nameOf(transfer.toId)}</div>
            <div className="t2">{t('split.transferNote')}</div>
          </div>
          <div className="r"><div className="val">{money.fmt(transfer.amount)}</div></div>
        </div>
      ))}

      <div className="note"><Info /><span>{t('split.taxNote')}</span></div>
      <button className="cta" disabled={owedToMe.length === 0 || creating} onClick={() => void createReceivables()}>
        {creating ? t('split.creating') : t('split.cta', { n: owedToMe.length })}
      </button>
    </>
  );
}
