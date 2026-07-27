'use client';

import React from 'react';
import { useUI, useMoney, useT, beneficiaryKindLabel } from '../components/AppShell';
import { useBeneficiaries, useTransactions } from '../application/hooks';
import { Info, Plus, User } from '../components/ui/icons';

const KIND_COLOR: Record<string, string> = {
  person: '#2F4858',
  family: '#9B6B43',
  church: '#4c2a86',
  organization: '#0a8cd4',
  business: '#00786a',
};

export default function PeopleScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const { beneficiaries } = useBeneficiaries();
  const { data: transactions } = useTransactions();

  // Rekap per pihak: berapa kali muncul dan berapa nilainya (masuk vs keluar).
  const stats = new Map<string, { count: number; out: number; in: number }>();
  transactions.forEach((tx) => {
    if (!tx.beneficiaryId) return;
    const entry = stats.get(tx.beneficiaryId) ?? { count: 0, out: 0, in: 0 };
    entry.count += 1;
    if (tx.type === 'income') entry.in += tx.amount;
    if (tx.type === 'expense') entry.out += tx.amount;
    stats.set(tx.beneficiaryId, entry);
  });

  return (
    <>
      <div className="note"><Info /><span>{t('people.note')}</span></div>

      <div className="sec">
        <span className="t">{t('people.list')}</span>
        <button className="addg" onClick={() => ui.openCreate('beneficiary')}><Plus />{t('common.add')}</button>
      </div>

      {beneficiaries.length === 0 && <div className="saving-empty">{t('people.empty')}</div>}

      {beneficiaries.map((person) => {
        const entry = stats.get(person.id);
        return (
          <div className="row" key={person.id} onClick={() => ui.openItem(person.name, 'beneficiary', person.id)}>
            <div className="lg" style={{ background: KIND_COLOR[person.kind] || '#444' }}>{person.name[0]?.toUpperCase()}</div>
            <div className="mid">
              <div className="t1">{person.name}</div>
              <div className="t2">
                <span className="chip">{beneficiaryKindLabel(person.kind)}</span>
                {person.note && <span>{person.note}</span>}
              </div>
            </div>
            <div className="r">
              {entry ? (
                <>
                  {entry.out > 0 && <div className="val out">-{money.fmtCompact(entry.out)}</div>}
                  {entry.in > 0 && <div className="val in">+{money.fmtCompact(entry.in)}</div>}
                  <div className="subt">{entry.count} {t('people.txCount')}</div>
                </>
              ) : (
                <div className="subt">{t('people.noTx')}</div>
              )}
            </div>
          </div>
        );
      })}

      <div className="sec"><span className="t">{t('people.howto')}</span></div>
      <div className="card manage">
        <button className="mrow" onClick={ui.openAdd}>
          <div className="mi"><User /></div>
          <div className="mm"><div className="ml">{t('people.useInTx')}</div><div className="ms">{t('people.useInTxDesc')}</div></div>
        </button>
      </div>
    </>
  );
}
