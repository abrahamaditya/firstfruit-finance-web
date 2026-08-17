'use client';

import React from 'react';
import { beneficiaryKindLabel, useMoney, useT, useUI } from '../components/AppShell';
import { useBeneficiaries, useTransactions, useWallets } from '../application/hooks';
import { Chevron, Info, Plus, User } from '../components/ui/icons';

const KIND_COLOR: Record<string, string> = {
  person: '#2f7f70',
  group: '#7160a8',
};

export default function PeopleScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const { beneficiaries } = useBeneficiaries();
  const { data: transactions } = useTransactions();
  const { wallets } = useWallets();
  const [expandedBeneficiaryId, setExpandedBeneficiaryId] = React.useState<string | null>(null);
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const stats = new Map<string, { count: number; outgoing: number; incoming: number }>();
  const transactionsByBeneficiary = React.useMemo(() => transactions.reduce((groups, transaction) => {
    if (!transaction.beneficiaryId) return groups;
    const current = groups.get(transaction.beneficiaryId) ?? [];
    current.push(transaction);
    groups.set(transaction.beneficiaryId, current);
    return groups;
  }, new Map<string, typeof transactions>()), [transactions]);
  const walletName = (walletId: string) => wallets.find((wallet) => wallet.id === walletId)?.name ?? 'Dompet';

  transactions.forEach((transaction) => {
    if (transaction.adjustment || !transaction.beneficiaryId) return;
    const current = stats.get(transaction.beneficiaryId) ?? { count: 0, outgoing: 0, incoming: 0 };
    current.count += 1;
    if (transaction.type === 'expense') current.outgoing += transaction.amount;
    if (transaction.type === 'income') current.incoming += transaction.amount;
    stats.set(transaction.beneficiaryId, current);
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
        const summary = stats.get(person.id);
        const relatedTransactions = transactionsByBeneficiary.get(person.id) ?? [];
        const expanded = expandedBeneficiaryId === person.id;
        return (
          <div className={`row beneficiary-row${expanded ? ' expanded' : ''}`} key={person.id} onClick={() => ui.openItem(person.name, 'beneficiary', person.id)}>
            <div className="lg" style={{ background: KIND_COLOR[person.kind] }}>{person.name[0]?.toUpperCase()}</div>
            <div className="mid">
              <div className="t1">{person.name}</div>
              <div className="t2">
                <span className="chip">{beneficiaryKindLabel(person.kind)}</span>
                {person.note && <span>{person.note}</span>}
              </div>
            </div>
            <div className="r">
              {summary ? (
                <>
                  {summary.outgoing > 0 && <div className="val out">-{money.fmt(summary.outgoing)}</div>}
                  {summary.incoming > 0 && <div className="val in">+{money.fmt(summary.incoming)}</div>}
                  <div className="subt">{summary.count} {t('people.txCount')}</div>
                </>
              ) : <div className="subt">{t('people.noTx')}</div>}
              <button
                type="button"
                className="beneficiary-transactions-toggle"
                aria-expanded={expanded}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpandedBeneficiaryId((current) => current === person.id ? null : person.id);
                }}
              >
                <span>{relatedTransactions.length} {t('people.txCount')}</span>
                <Chevron />
              </button>
            </div>
            {expanded && (
              <div className="beneficiary-transactions budget-transactions" onClick={(event) => event.stopPropagation()}>
                {relatedTransactions.length === 0 ? (
                  <span className="budget-transactions-empty">{t('people.noTx')}</span>
                ) : relatedTransactions.map((transaction) => {
                  const title = transaction.merchant || transaction.note || transaction.labels.at(-1) || 'Transaksi';
                  const date = new Date(transaction.date).toLocaleDateString(locale, {
                    day: 'numeric', month: 'short', year: 'numeric',
                  });
                  const direction = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '−' : '';
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
                      <span>
                        <b>{title}</b>
                        <small>{date} · {transaction.labels.at(-1) || walletName(transaction.walletId)} · {walletName(transaction.walletId)}</small>
                      </span>
                      <b className={transaction.type === 'income' ? 'positive' : transaction.type === 'expense' ? 'negative' : ''}>
                        {direction}{money.fmt(transaction.amount)}
                      </b>
                    </button>
                  );
                })}
              </div>
            )}
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
