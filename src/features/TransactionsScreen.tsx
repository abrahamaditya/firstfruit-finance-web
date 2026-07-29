'use client';

import React, { useDeferredValue, useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useSavings, useTransactions, useWallets } from '../application/hooks';
import { Up, Down, TransferCard, Plus, Search } from '../components/ui/icons';

export default function TransactionsScreen() {
  const ui = useUI();
  const money = useMoney();
  const tr = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const { data } = useTransactions();
  const { wallets } = useWallets();
  const { all: savings } = useSavings();
  const walletName = (id?: string) => wallets.find((wallet) => wallet.id === id)?.name;
  const walletById = new Map(wallets.map(wallet => [wallet.id, wallet]));
  const savingName = (id?: string) => id ? savings.find((saving) => saving.id === id)?.name : undefined;
  const transactionTitle = (transaction: typeof data[number]) => {
    if (transaction.type === 'transfer') {
      return `${walletName(transaction.walletId) ?? 'Dompet asal'} → ${walletName(transaction.toWalletId) ?? 'Dompet tujuan'}`;
    }
    return transaction.note || transaction.labels.at(-1) || 'Transaksi';
  };
  const dayLabel = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diff = Math.round((+new Date(now.toDateString()) - +new Date(date.toDateString())) / 86_400_000);
    const formatted = date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    return `${diff === 0 ? tr('tx.today') + ' · ' : diff === 1 ? tr('tx.yesterday') + ' · ' : ''}${formatted}`;
  };
  const formatAmount = (type: string, amount: number) =>
    `${type === 'income' ? '+' : type === 'expense' ? '-' : ''}${money.fmt(amount)}`;
  const [filter, setFilter] = useState<'all' | 'expense' | 'income' | 'transfer'>('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.toLowerCase());

  const matchesType = (transaction: { type: string }) => filter === 'all' || transaction.type === filter;
  // Kategori yang ditawarkan mengikuti filter jenis — jadi saat "Pemasukan" dipilih,
  // yang muncul hanya kategori pemasukan yang benar-benar ada datanya.
  const categoryCounts = new Map<string, number>();
  data.filter(matchesType).forEach((transaction) =>
    transaction.labels.forEach((label) => categoryCounts.set(label, (categoryCounts.get(label) || 0) + 1)),
  );
  const categories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const activeCategory = categoryCounts.has(category) ? category : 'all';

  const visible = data.filter((transaction) =>
    matchesType(transaction) &&
    (activeCategory === 'all' || transaction.labels.includes(activeCategory)) &&
    `${transaction.note} ${transaction.merchant || ''} ${transaction.labels.join(' ')} ${walletName(transaction.walletId) || ''} ${walletName(transaction.toWalletId) || ''} ${savingName(transaction.savingId) || ''}`
      .toLowerCase().includes(deferredQuery),
  );
  const groups: Record<string, typeof data> = {};
  visible.forEach((transaction) => {
    const key = dayLabel(transaction.date);
    (groups[key] ||= []).push(transaction);
  });

  return (
    <>
      <div className="screen-toolbar">
        <label className="search-box">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr('tx.searchPlaceholder')}
          />
        </label>
        <button className="addg" onClick={ui.openAdd}><Plus />{tr('tx.log')}</button>
      </div>

      <div className="filter-pills">
        {[
          ['all', tr('tx.filterAll')],
          ['expense', tr('tx.filterExpense')],
          ['income', tr('tx.filterIncome')],
          ['transfer', tr('tx.filterTransfer')],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? 'on' : ''}
            onClick={() => setFilter(value as typeof filter)}
          >
            {label}
          </button>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="filter-pills sub-filter">
          <button className={activeCategory === 'all' ? 'on' : ''} onClick={() => setCategory('all')}>
            {tr('tx.filterAllCategories')}
            <span className="pill-count">{data.filter(matchesType).length}</span>
          </button>
          {categories.map(([name, count]) => (
            <button key={name} className={activeCategory === name ? 'on' : ''} onClick={() => setCategory(name)}>
              {name}
              <span className="pill-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {Object.entries(groups).map(([day, items]) => (
        <React.Fragment key={day}>
          <div className="tx-day">{day.toUpperCase()}</div>
          {items.map((transaction) => {
            const sourceWallet = walletById.get(transaction.walletId);
            const destinationWallet = transaction.toWalletId
              ? walletById.get(transaction.toWalletId)
              : undefined;
            return (
              <div
                className="row"
                key={transaction.id}
                onClick={() =>
                  ui.openItem(
                    transactionTitle(transaction),
                    transaction.type === 'transfer' ? 'transfer' : 'transaksi',
                    transaction.id,
                  )
                }
              >
                <div className={`ic ${transaction.type === 'income' ? 'in' : transaction.type === 'transfer' ? '' : 'out'}`}>
                  {transaction.type === 'income' ? <Down /> : transaction.type === 'transfer' ? <TransferCard /> : <Up />}
                </div>
                <div className="mid">
                  <div className="t1">{transactionTitle(transaction)}</div>
                  <div className="t2">
                    {(transaction.note ? transaction.labels : transaction.labels.slice(0, -1))
                      .map((label) => <span className="chip" key={label}>{label}</span>)}
                    {transaction.merchant && <span className="chip">📍 {transaction.merchant}</span>}
                    {transaction.type === 'transfer' && transaction.savingId && (
                      <span className="chip saving-destination">
                        Tabungan · {savingName(transaction.savingId) ?? 'Tabungan'}
                      </span>
                    )}
                    {transaction.installmentTenorMonths && (
                      <span className="chip">Cicilan · {transaction.installmentTenorMonths} bulan</span>
                    )}
                    {transaction.nature === 'unexpected' && <span className="chip">{tr('tx.unexpected')}</span>}
                  </div>
                </div>
                <div className="r">
                  <div className={`val ${transaction.type === 'income' ? 'in' : transaction.type === 'transfer' ? '' : 'out'}`}>
                    {formatAmount(transaction.type, transaction.amount)}
                  </div>
                  {sourceWallet && (
                    <span className="tx-wallet-label">
                      {transaction.type === 'transfer' && destinationWallet
                        ? `${sourceWallet.name} → ${destinationWallet.name}`
                        : transaction.type === 'income'
                          ? `Ke ${sourceWallet.name}`
                          : `Dari ${sourceWallet.name}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </React.Fragment>
      ))}

      {visible.length === 0 && (
        <div className="empty-state">
          <Search />
          <b>{tr('tx.emptyTitle')}</b>
          <span>{tr('tx.emptyBody')}</span>
        </div>
      )}
    </>
  );
}
