'use client';

import React, { useDeferredValue, useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { usePeriodTransactions, useSavings, useWallets } from '../application/hooks';
import { Up, Down, TransferCard, Plus, Search } from '../components/ui/icons';
import { walletBrandLogo, walletProductInitial } from '../core/wallet-branding';
import { GIVING_LABELS_ID, categoryPath, categoryTone } from '../core/domain/categories';
import { isActualIncome } from '../core/domain/calculations';

export default function TransactionsScreen() {
  const ui = useUI();
  const money = useMoney();
  const tr = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const { data } = usePeriodTransactions(ui.periodId);
  const { wallets } = useWallets();
  const { all: savings } = useSavings();
  const walletName = (id?: string) => wallets.find((wallet) => wallet.id === id)?.name;
  const walletById = new Map(wallets.map(wallet => [wallet.id, wallet]));
  const walletReference = (entry: typeof wallets[number]) => {
    const logo = walletBrandLogo(entry);
    return (
      <span className="tx-wallet-ref" title={entry.name}>
        <span className={`tx-wallet-mark${logo ? ' has-image' : ''}${entry.medium === 'cash' ? ' is-cash' : ''}`} aria-hidden="true">
          {logo ? <img src={logo} alt="" /> : walletProductInitial(entry)}
        </span>
        <span>{entry.name}</span>
      </span>
    );
  };
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
    const formatted = date.toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return `${diff === 0 ? tr('tx.today') + ' · ' : diff === 1 ? tr('tx.yesterday') + ' · ' : ''}${formatted}`;
  };
  const formatAmount = (type: string, amount: number) =>
    `${type === 'income' ? '+' : type === 'expense' ? '-' : ''}${money.fmt(amount)}`;
  const [filter, setFilter] = useState<'all' | 'expense' | 'income' | 'actualIncome' | 'transfer'>('all');
  const [wallet, setWallet] = useState('all');
  const [selectedCategoryTrail, setSelectedCategoryTrail] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.toLowerCase());

  const matchesType = (transaction: typeof data[number]) => filter === 'all'
    || (filter === 'actualIncome' ? isActualIncome(transaction) : transaction.type === filter);
  const byType = data.filter(matchesType);

  // Transfer dihitung di dua dompet sekaligus — uangnya memang lewat keduanya, jadi
  // memfilter dompet asal maupun tujuan sama-sama harus memunculkan transfer itu.
  const walletCounts = new Map<string, number>();
  const bumpWallet = (id?: string) => { if (id) walletCounts.set(id, (walletCounts.get(id) || 0) + 1); };
  byType.forEach((transaction) => {
    bumpWallet(transaction.walletId);
    if (transaction.toWalletId && transaction.toWalletId !== transaction.walletId) bumpWallet(transaction.toWalletId);
  });
  // Seluruh dompet selalu ditawarkan, termasuk yang belum punya transaksi pada jenis yang
  // sedang dipilih. Angka 0 itu sendiri sudah jadi jawaban ("belum ada pemasukan ke sini"),
  // sementara daftar yang isinya keluar-masuk membuat dompet terasa raib.
  // Urutannya mengikuti layar Dompet — rekening, e-wallet, tunai, kredit — supaya tetap di
  // tempat yang sama saat filter jenis diganti, bukan berpindah mengikuti jumlah.
  const walletRank: Record<string, number> = { bank: 0, ewallet: 1, cash: 2, credit: 3 };
  const mediumOf = (entry: typeof wallets[number]) =>
    entry.medium ?? (entry.kind === 'credit' ? 'credit' : 'bank');
  const walletPills = [...wallets]
    .sort((a, b) => (walletRank[mediumOf(a)] ?? 99) - (walletRank[mediumOf(b)] ?? 99)
      || a.name.localeCompare(b.name, locale))
    .map((entry) => [entry, walletCounts.get(entry.id) ?? 0] as const);
  // Dompet kosong tetap boleh dipilih: hasilnya memang kosong, dan itu jawaban yang jujur.
  // Pilihan hanya dilepas kalau dompetnya benar-benar sudah tidak ada.
  const activeWallet = wallets.some((entry) => entry.id === wallet) ? wallet : 'all';
  const matchesWallet = (transaction: { walletId: string; toWalletId?: string }) =>
    activeWallet === 'all' || transaction.walletId === activeWallet || transaction.toWalletId === activeWallet;

  // Tiap tingkat kategori dihitung dari hasil jenis + dompet yang sedang dipilih.
  const scoped = byType.filter(matchesWallet);
  const categoryTrailOf = (transaction: typeof data[number]) => categoryPath(
    transaction.labels.at(-1) ?? '',
    transaction.type === 'income' ? 'income' : 'expense',
  );
  const matchesCategoryTrail = (transaction: typeof data[number], trail: string[]) => {
    const transactionTrail = categoryTrailOf(transaction);
    return trail.every((part, index) => transactionTrail[index] === part);
  };
  const categoryChoices = (parent: string[]): Array<[string, number]> => {
    const counts = new Map<string, number>();
    scoped.forEach((transaction) => {
      const trail = categoryTrailOf(transaction);
      if (parent.every((part, index) => trail[index] === part) && trail[parent.length]) {
        const name = trail[parent.length];
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale));
  };
  const activeCategoryTrail: string[] = [];
  for (const name of selectedCategoryTrail) {
    if (!categoryChoices(activeCategoryTrail).some(([choice]) => choice === name)) break;
    activeCategoryTrail.push(name);
  }
  const categoryLevels: Array<{ parent: string[]; choices: Array<[string, number]> }> = [
    { parent: [], choices: categoryChoices([]) },
  ];
  activeCategoryTrail.forEach((_, index) => {
    const parent = activeCategoryTrail.slice(0, index + 1);
    const choices = categoryChoices(parent);
    if (choices.length > 0) categoryLevels.push({ parent, choices });
  });
  const displayCategory = (name: string, parent: string[] = []) =>
    ui.prefs.language === 'EN' || parent[0] !== 'Giving' ? name : GIVING_LABELS_ID[name] ?? name;
  // Nominal bisa dicari dengan format apa pun yang umum diketik pengguna: 30000,
  // 30.000, 30,000, atau Rp30.000 semuanya menjadi 30000.
  const amountQuery = deferredQuery.replace(/\D/g, '');

  const visible = scoped.filter((transaction) => {
    const categoryTrail = categoryTrailOf(transaction);
    const translatedCategory = categoryTrail
      .map((name, index) => displayCategory(name, categoryTrail.slice(0, index)))
      .join(' ');
    const matchesText = `${transaction.note} ${transaction.merchant || ''} ${transaction.labels.join(' ')} ${translatedCategory} ${walletName(transaction.walletId) || ''} ${walletName(transaction.toWalletId) || ''} ${savingName(transaction.savingId) || ''} ${money.fmt(transaction.amount)}`
      .toLowerCase().includes(deferredQuery);
    const matchesAmount = amountQuery.length > 0 && String(transaction.amount).includes(amountQuery);
    return matchesCategoryTrail(transaction, activeCategoryTrail)
      && (matchesText || matchesAmount);
  });
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
        {!ui.isArchivePeriod && <button className="addg" onClick={ui.openAdd}><Plus />{tr('tx.log')}</button>}
      </div>

      <div className="filter-pills">
        {[
          ['all', tr('tx.filterAll')],
          ['expense', tr('tx.filterExpense')],
          ['income', tr('tx.filterIncome')],
          ['actualIncome', tr('tx.filterActualIncome')],
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

      {/* Dengan satu dompet saja, memfilter per dompet tidak menyaring apa pun. */}
      {walletPills.length > 1 && (
        <div className="filter-pills sub-filter">
          <button className={activeWallet === 'all' ? 'on' : ''} onClick={() => setWallet('all')}>
            {tr('tx.filterAllWallets')}
            <span className="pill-count">{byType.length}</span>
          </button>
          {walletPills.map(([entry, count]) => {
            const logo = walletBrandLogo(entry);
            return (
              <button
                key={entry.id}
                className={`${activeWallet === entry.id ? 'on' : ''}${count === 0 ? ' is-empty' : ''}`.trim()}
                onClick={() => setWallet(entry.id)}
              >
                <span className={`pill-mark${logo ? ' has-image' : ''}${entry.medium === 'cash' ? ' is-cash' : ''}`} aria-hidden="true">
                  {logo ? <img src={logo} alt="" /> : walletProductInitial(entry)}
                </span>
                {entry.name}
                <span className="pill-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {categoryLevels[0].choices.length > 0 && (
        <div className="tx-category-filters">
          {categoryLevels.map(({ parent, choices }) => {
            const depth = parent.length;
            const heading = depth === 0 ? tr('tx.category')
              : parent[0] === 'Giving'
                ? depth === 1 ? tr('tx.givingType') : tr('tx.givingDetail')
                : depth === 1 ? tr('tx.subcategory') : tr('tx.categoryDetail');
            return (
              <div className="tx-category-level" key={parent.join('/') || 'root'}>
                <div className="tx-category-level-heading">
                  <span>{heading}</span>
                  {depth > 0 && <small>{parent.map((name, index) => displayCategory(name, parent.slice(0, index))).join(' › ')}</small>}
                </div>
                <div className="filter-pills sub-filter tx-category-level-pills" role="group" aria-label={heading}>
                  <button
                    className={activeCategoryTrail.length === depth ? 'on' : ''}
                    aria-pressed={activeCategoryTrail.length === depth}
                    onClick={() => setSelectedCategoryTrail(parent)}
                  >
                    {depth === 0 ? tr('tx.filterAllCategories') : `${tr('tx.filterAll')} ${displayCategory(parent.at(-1) ?? '', parent.slice(0, -1))}`}
                    <span className="pill-count">{scoped.filter((transaction) => matchesCategoryTrail(transaction, parent)).length}</span>
                  </button>
                  {choices.map(([name, count]) => (
                    <button
                      key={name}
                      className={activeCategoryTrail[depth] === name ? 'on' : ''}
                      aria-pressed={activeCategoryTrail[depth] === name}
                      onClick={() => setSelectedCategoryTrail([...parent, name])}
                    >
                      {displayCategory(name, parent)}
                      <span className="pill-count">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {Object.entries(groups).map(([day, items]) => (
        <React.Fragment key={day}>
          <div className="tx-day">{day}</div>
          {items.map((transaction) => {
            const sourceWallet = walletById.get(transaction.walletId);
            const destinationWallet = transaction.toWalletId
              ? walletById.get(transaction.toWalletId)
              : undefined;
            const installmentBillNumber = transaction.installmentTenorMonths
              ? Math.min(
                transaction.installmentTenorMonths,
                Math.max(1, (transaction.installmentPaidMonths ?? 0) + 1),
              )
              : null;
            const installmentCompleted = transaction.installmentTenorMonths != null
              && (transaction.installmentPaidMonths ?? 0) >= transaction.installmentTenorMonths;
            return (
              <div
                className={`row transaction-row${transaction.type === 'transfer' ? ' transfer-row' : ''}`}
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
                  <div className="t1">
                    {transaction.type === 'transfer' ? (
                      <span className="transfer-route">
                        <span className="transfer-source">{sourceWallet?.name ?? 'Dompet asal'}</span>
                        <i aria-hidden="true">→</i>
                        <span className="transfer-destination">{destinationWallet?.name ?? 'Dompet tujuan'}</span>
                      </span>
                    ) : transactionTitle(transaction)}
                  </div>
                  <div className="t2">
                    {transaction.type === 'income' && (
                      <span className="chip" data-cat="income">
                        {isActualIncome(transaction) ? tr('reports.actualIncome') : tr('tx.receivableIncome')}
                      </span>
                    )}
                    {(transaction.type === 'transfer' || transaction.note
                      ? transaction.labels
                      : transaction.labels.slice(0, -1))
                      .map((label, index, labels) => (
                        <span
                          className={`chip${index < labels.length - 1 ? ' tx-category-parent' : ''}`}
                          data-cat={categoryTone(label)}
                          key={label}
                        >
                          {label}
                        </span>
                      ))}
                    {transaction.merchant && <span className="chip">📍 {transaction.merchant}</span>}
                    {transaction.type === 'transfer' && transaction.savingId && (
                      <span className="chip saving-destination">
                        Tabungan · {savingName(transaction.savingId) ?? 'Tabungan'}
                      </span>
                    )}
                    {transaction.installmentTenorMonths && (
                      <span className="chip">
                        Tagihan cicilan {installmentBillNumber}/{transaction.installmentTenorMonths}
                        {installmentCompleted && ' · Lunas'}
                      </span>
                    )}
                    {transaction.nature === 'unexpected' && <span className="chip">{tr('tx.unexpected')}</span>}
                  </div>
                </div>
                <div className="r tx-amount-line">
                  {sourceWallet && (
                    <span className="tx-wallet-label">
                      {transaction.type === 'transfer' && destinationWallet
                        ? <>{walletReference(sourceWallet)}<i aria-hidden="true">→</i>{walletReference(destinationWallet)}</>
                        : <>
                          <small>{transaction.type === 'income' ? 'Ke' : 'Dari'}</small>
                          {walletReference(sourceWallet)}
                        </>}
                    </span>
                  )}
                  <div className={`val ${transaction.type === 'income' ? 'in' : transaction.type === 'transfer' ? '' : 'out'}`}>
                    {formatAmount(transaction.type, transaction.amount)}
                  </div>
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
