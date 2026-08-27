'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useWallets, useSavings, useTransactions, usePeriods } from '../application/hooks';
import { ArrowLeft, CardChip, ChevronR, Down, Eye, EyeOff, ListIcon, Pencil, Plus, TransferCard, Up, WalletIcon } from '../components/ui/icons';
import type { Transaction } from '../core/domain/types';
import { isActualIncome, isWalletIncome } from '../core/domain/calculations';
import { walletCardTheme } from '../core/wallet-card-theme';
import { walletBrandLogo, walletNetworkLogo, walletProductInitial } from '../core/wallet-branding';
import { walletProduct } from '../core/wallet-products';

const mediumOf = (w: { medium?: string; kind: string }) => w.medium ?? (w.kind === 'credit' ? 'credit' : 'bank');
const transactionTitle = (transaction: Transaction) =>
  transaction.note
  || transaction.labels.at(-1)
  || (transaction.type === 'income' ? 'Pemasukan' : transaction.type === 'transfer' ? 'Transfer' : 'Pengeluaran');

export default function WalletsScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const { wallets } = useWallets();
  const { savings, reservedIn } = useSavings();
  const { data: transactions } = useTransactions();
  const { active: activePeriod } = usePeriods();
  const mediumRank: Record<string, number> = { bank: 0, ewallet: 1, cash: 2, credit: 3 };
  const byCategoryThenName = (a: typeof wallets[number], b: typeof wallets[number]) =>
    (mediumRank[mediumOf(a)] ?? 99) - (mediumRank[mediumOf(b)] ?? 99)
    || a.name.localeCompare(b.name, 'id-ID');
  const debit = wallets.filter(w => w.kind === 'debit').sort(byCategoryThenName);
  const credit = wallets.filter(w => w.kind === 'credit').sort(byCategoryThenName);
  const walletName = (id: string) => wallets.find(w => w.id === id)?.name ?? 'dompet';
  const savingOwnershipLabel = (ownership: 'self' | 'other') =>
    ownership === 'other' ? t('wallets.savingForOther') : t('wallets.savingForSelf');
  const [hidden, setHidden] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | 'all'>('all');
  const walletOrder = ui.prefs.walletOrder;
  const [reorderMode, setReorderMode] = useState(false);
  const [draggedWalletId, setDraggedWalletId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollSettleTimerRef = useRef<number | null>(null);

  // Carousel selalu berangkat dari dompet debit Utama. Sisanya mengikuti kategori:
  // rekening/debit → e-wallet → tunai → kredit.
  const primaryDebit =
    debit.find((wallet) => wallet.id === ui.prefs.defaultWalletId)
    ?? debit[0];
  const defaultCards = primaryDebit
    ? [primaryDebit, ...debit.filter((wallet) => wallet.id !== primaryDebit.id), ...credit]
    : [...credit];
  const orderRank = new Map(walletOrder.map((id, index) => [id, index]));
  const cards = [...defaultCards].sort((a, b) => {
    const aRank = orderRank.get(a.id);
    const bRank = orderRank.get(b.id);
    if (aRank == null && bRank == null) return defaultCards.indexOf(a) - defaultCards.indexOf(b);
    if (aRank == null) return 1;
    if (bRank == null) return -1;
    return aRank - bRank;
  });
  const active = selectedWalletId === 'all'
    ? 0
    : Math.max(0, cards.findIndex((wallet) => wallet.id === selectedWalletId) + 1);
  const current = selectedWalletId === 'all'
    ? undefined
    : cards.find((wallet) => wallet.id === selectedWalletId);
  const currentReserved = current ? reservedIn(current.id) : 0;
  const totalDebit = debit.reduce((sum, wallet) => sum + wallet.balance, 0);
  const totalCredit = credit.reduce((sum, wallet) => sum + wallet.balance, 0);
  const totalLiquidity = totalDebit - totalCredit;
  const totalReserved = savings.reduce((sum, saving) => sum + saving.balance, 0);
  const availableDebit = totalDebit - totalReserved;
  const summaryAmount = (value: number) => hidden ? '••••••' : money.fmt(value);

  const persistOrder = (orderedIds: string[]) => {
    ui.setPref('walletOrder', orderedIds);
  };
  const moveWallet = (walletId: string, direction: -1 | 1) => {
    const ids = cards.map((wallet) => wallet.id);
    const from = ids.indexOf(walletId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    persistOrder(ids);
    setSelectedWalletId(walletId);
  };
  const dropWallet = (targetWalletId: string) => {
    if (!draggedWalletId || draggedWalletId === targetWalletId) return;
    const ids = cards.map((wallet) => wallet.id);
    const from = ids.indexOf(draggedWalletId);
    const to = ids.indexOf(targetWalletId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    persistOrder(ids);
    setSelectedWalletId(draggedWalletId);
    setDraggedWalletId(null);
  };

  useEffect(() => {
    if (!reorderMode || selectedWalletId === 'all') return;
    const nextIndex = cards.findIndex((wallet) => wallet.id === selectedWalletId) + 1;
    if (nextIndex <= 0) return;
    const frame = requestAnimationFrame(() => {
      trackRef.current?.scrollTo({ left: nextIndex * slideWidth(), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
    // Hanya urutan yang memicu realignment; scroll biasa tidak boleh dilawan effect ini.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletOrder]);

  useEffect(() => () => {
    if (scrollSettleTimerRef.current != null) window.clearTimeout(scrollSettleTimerRef.current);
  }, []);

  // Track punya padding (zona pudar di tepi), jadi patokannya lebar slide, bukan
  // clientWidth: slide ke-n selalu berhenti pas di scrollLeft = n × lebar slide.
  const slideWidth = () => (trackRef.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
  // Scroll selalu memperbarui kartu aktif — di ponsel berarti kartu yang sedang dilihat,
  // di deret desktop kartu paling kiri. Titik indikator ikut bergerak di keduanya.
  const selectCardAtScrollPosition = () => {
    const track = trackRef.current;
    const width = slideWidth();
    if (!track || !width) return;
    const index = Math.max(0, Math.min(cards.length, Math.round(track.scrollLeft / width)));
    const nextWalletId = index === 0 ? 'all' : cards[index - 1]?.id ?? 'all';
    setSelectedWalletId((previous) => previous === nextWalletId ? previous : nextWalletId);
  };
  // Detail hanya diperbarui setelah scroll berhenti. Ini mencegah kartu-kartu yang
  // dilewati animasi smooth scroll sempat merender ringkasan yang salah.
  const onScroll = () => {
    if (scrollSettleTimerRef.current != null) window.clearTimeout(scrollSettleTimerRef.current);
    scrollSettleTimerRef.current = window.setTimeout(() => {
      selectCardAtScrollPosition();
      scrollSettleTimerRef.current = null;
    }, 120);
  };
  const goToCard = (index: number) => {
    const safeIndex = Math.max(0, Math.min(cards.length, index));
    if (scrollSettleTimerRef.current != null) window.clearTimeout(scrollSettleTimerRef.current);
    scrollSettleTimerRef.current = null;
    setSelectedWalletId(safeIndex === 0 ? 'all' : cards[safeIndex - 1]?.id ?? 'all');
    trackRef.current?.scrollTo({ left: safeIndex * slideWidth(), behavior: 'smooth' });
  };

  const cardSubtitle = (w: typeof cards[number]) => {
    const medium = mediumOf(w);
    if (medium === 'ewallet') return w.phone ? (hidden ? '••••••••' : w.phone) : t('wallets.ewallet');
    if (medium === 'cash') return t('wallets.physicalWallet');
    return `•••• •••• •••• ${hidden ? '••••' : w.last4 || '••••'}`;
  };
  const brandLogo = (w: typeof cards[number]) => {
    const src = walletBrandLogo(w);
    return src ? { src, alt: w.bank || w.name } : undefined;
  };
  const supportsCardChip = (w: typeof cards[number]) => {
    const medium = mediumOf(w);
    return medium === 'bank' || medium === 'credit' || (medium === 'ewallet' && w.bank === 'Flazz BCA');
  };
  const walletListIcon = (w: typeof cards[number], fallback: string, background: string) => {
    const logo = brandLogo(w);
    const network = walletNetworkLogo(w);
    return (
      <div className={`lg${logo ? ' has-logo' : ''}${mediumOf(w) === 'cash' ? ' is-cash' : ''}${network ? ' has-network' : ''}`} style={logo ? undefined : { background }}>
        {logo ? <img className="lg-primary" src={logo.src} alt={logo.alt} /> : fallback}
        {network && <img className="lg-network" src={network} alt={w.cardNetwork?.toUpperCase() || 'Jaringan kartu'} />}
      </div>
    );
  };
  // Dompet default hanya bisa berupa dompet debit (lihat pemilihnya di layar Profil),
  // jadi kapsul ini tidak akan pernah muncul di kartu kredit.
  const isDefault = (id: string) => Boolean(ui.prefs.defaultWalletId) && ui.prefs.defaultWalletId === id;
  // Judulnya menjelaskan akibat dari status ini, karena kata "Default" saja tidak
  // memberi tahu apa yang berubah karenanya.
  const defaultTag = (id: string) => isDefault(id) && (
    <span className="tag-default" title={t('profile.defaultWalletNote')}>{t('wallets.defaultTag')}</span>
  );

  const selectedTransactions = current
    ? transactions.filter((transaction) => transaction.walletId === current.id || transaction.toWalletId === current.id)
    : [];
  const selectedSavings = current ? savings.filter((saving) => saving.walletId === current.id) : [];
  const now = new Date();
  const periodStart = activePeriod ? new Date(activePeriod.start) : new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = activePeriod ? new Date(activePeriod.end) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  periodStart.setHours(0, 0, 0, 0);
  periodEnd.setHours(23, 59, 59, 999);
  const periodTransactions = selectedTransactions.filter((transaction) => {
    const at = new Date(transaction.date);
    return at >= periodStart && at <= periodEnd;
  });
  const actualExpensePeriod = periodTransactions
    .filter((transaction) => !transaction.adjustment && transaction.type === 'expense' && transaction.walletId === current?.id)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const creditPaymentPeriod = current?.kind === 'credit'
    ? periodTransactions
      .filter((transaction) => !transaction.adjustment
        && transaction.type === 'transfer'
        && transaction.toWalletId === current.id)
      .reduce((sum, transaction) => sum + transaction.amount, 0)
    : 0;
  // Saldo kartu adalah kewajiban saat ini. Untuk menjelaskan siklus tagihannya,
  // balik perubahan selama periode: belanja menambah, pelunasan mengurangi, dan
  // penyesuaian manual tetap ikut agar angka pembuka tidak meleset.
  const creditAdjustmentDeltaPeriod = current?.kind === 'credit'
    ? periodTransactions
      .filter((transaction) => transaction.adjustment && transaction.walletId === current.id)
      .reduce((sum, transaction) => sum + (transaction.type === 'income' ? transaction.amount : -transaction.amount), 0)
    : 0;
  const previousCreditBill = current?.kind === 'credit'
    ? Math.max(0, current.balance - actualExpensePeriod + creditPaymentPeriod - creditAdjustmentDeltaPeriod)
    : 0;
  const receivedPeriod = current ? periodTransactions
    .filter((transaction) => isWalletIncome(transaction, current.id))
    .reduce((sum, transaction) => sum + transaction.amount, 0)
    : 0;
  const actualIncomePeriod = periodTransactions
    .filter((transaction) => transaction.walletId === current?.id && isActualIncome(transaction))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const spentPeriod = periodTransactions
    .filter((transaction) => !transaction.adjustment
      && transaction.walletId === current?.id
      && (transaction.type === 'expense' || transaction.type === 'transfer'))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const nonRealIncomePeriod = Math.max(0, receivedPeriod - actualIncomePeriod);
  const transferOutPeriod = Math.max(0, spentPeriod - actualExpensePeriod);
  const periodLocale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const periodDate = (date: Date) => date.toLocaleDateString(periodLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  const periodName = activePeriod?.alias ?? 'Bulan berjalan';
  const periodRange = `${periodDate(periodStart)} – ${periodDate(periodEnd)}`;
  const transactionAmount = (transaction: Transaction) => {
    if (transaction.type === 'transfer') {
      return transaction.toWalletId === current?.id ? transaction.amount : -transaction.amount;
    }
    return transaction.type === 'income' ? transaction.amount : -transaction.amount;
  };
  const transactionDate = (iso: string) => new Intl.DateTimeFormat(
    ui.prefs.language === 'EN' ? 'en-US' : 'id-ID',
    { day: 'numeric', month: 'short' },
  ).format(new Date(iso));

  // Tanpa satu pun dompet, seluruh layar ini kehilangan pijakannya: tidak ada kartu untuk
  // digeser, tidak ada saldo untuk disembunyikan, dan tabungan mustahil ada karena ia
  // selalu disimpan di dalam sebuah dompet. Jadi yang tampil hanya satu ajakan, bukan
  // deretan bagian kosong yang membuat layar terasa rusak.
  if (cards.length === 0) {
    return (
      <div className="empty-state wallets-empty">
        <WalletIcon />
        <b>{t('wallets.emptyTitle')}</b>
        <span>{t('wallets.emptyLead')}</span>
        <button className="cta compact" onClick={() => ui.openCreate('wallet')}>
          <Plus />{t('wallets.emptyCta')}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="card-stack">
        <div className="wallet-carousel-toolbar">
          <button
            type="button"
            title={hidden ? t('wallets.show') : t('wallets.hide')}
            aria-label={hidden ? t('wallets.show') : t('wallets.hide')}
            onClick={() => { setHidden((value) => !value); ui.notify(hidden ? t('wallets.cardShown') : t('wallets.cardHidden')); }}
          >
            {hidden ? <Eye /> : <EyeOff />}
          </button>
          <button type="button" title={t('common.add')} aria-label={t('common.add')} onClick={() => ui.openCreate('wallet')}><Plus /></button>
          <button
            type="button"
            className={reorderMode ? 'active' : ''}
            title={reorderMode ? 'Selesai mengatur urutan' : 'Atur urutan kartu'}
            aria-label={reorderMode ? 'Selesai mengatur urutan' : 'Atur urutan kartu'}
            onClick={() => setReorderMode((value) => !value)}
          >
            <ListIcon />
          </button>
        </div>
        <div
          className="card-track"
          ref={trackRef}
          onScroll={onScroll}
        >
          <div className="card-slide" key="all-wallets">
            <div
              className={`all-wallets-overview${active === 0 ? '' : ' behind before'}`}
              onClick={() => goToCard(0)}
            >
              <div className="all-wallets-overview-head">
                <span className="all-wallets-overview-icon"><WalletIcon /></span>
                <span><small>Ringkasan keuangan</small><strong>Semua Dompet</strong></span>
                <b>{cards.length}</b>
              </div>
              <div className="all-wallets-overview-balance">
                <span>Total likuiditas</span>
                <strong>{hidden ? '••••••' : money.fmt(totalLiquidity)}</strong>
              </div>
              <div className="all-wallets-overview-stats">
                <span><small>Tersedia</small><b>{hidden ? '••••' : money.fmt(totalDebit - totalReserved)}</b></span>
                <span><small>Liabilitas</small><b className="out">{hidden ? '••••' : money.fmt(totalCredit)}</b></span>
              </div>
            </div>
          </div>
          {cards.map((w, index) => {
            const displayIndex = index + 1;
            const card = walletCardTheme(w);
            const primaryLogo = brandLogo(w);
            const networkLogo = walletNetworkLogo(w);
            return (
            <div
              className="card-slide"
              key={w.id}
              draggable={reorderMode}
              onDragStart={() => setDraggedWalletId(w.id)}
              onDragOver={(event) => { if (reorderMode) event.preventDefault(); }}
              onDrop={() => dropWallet(w.id)}
              onDragEnd={() => setDraggedWalletId(null)}
            >
              <div
                className={`paycard${mediumOf(w) === 'credit' ? ' credit' : ''}${reorderMode ? ' reordering' : ''}${
                  displayIndex === active ? '' : displayIndex < active ? ' behind before' : ' behind after'
                }`}
                data-theme={card.theme}
                data-pattern={card.pattern}
                onClick={() => goToCard(displayIndex)}
              >
                <div className="pt">
                  <span className="pt-name">
                    {primaryLogo
                      ? <img className="wallet-title-logo" src={primaryLogo.src} alt={primaryLogo.alt} />
                      : <span className="wallet-title-initial">{walletProductInitial(w)}</span>}
                    <span className="pb">{w.name}</span>
                    {defaultTag(w.id)}
                  </span>
                  <span className="pt-actions">
                    {reorderMode ? (
                      <span className="card-reorder-controls">
                        <button type="button" disabled={index === 0} aria-label={`Geser ${w.name} ke kiri`} onClick={(event) => { event.stopPropagation(); moveWallet(w.id, -1); }}><ArrowLeft /></button>
                        <button type="button" disabled={index === cards.length - 1} aria-label={`Geser ${w.name} ke kanan`} onClick={(event) => { event.stopPropagation(); moveWallet(w.id, 1); }}><ChevronR /></button>
                      </span>
                    ) : (
                      <>
                        <button
                          className="pcard-edit"
                          aria-label={t('wallets.editCard', { name: w.name })}
                          onClick={(event) => {
                            event.stopPropagation();
                            ui.openCreate('wallet', true, w.name, w.id);
                          }}
                        >
                          <Pencil />
                        </button>
                        {supportsCardChip(w) && <span className="pchip"><CardChip /></span>}
                      </>
                    )}
                  </span>
                </div>
                <div className="pn">{cardSubtitle(w)}</div>
                <div className="pbal">
                  <span>{mediumOf(w) === 'credit' ? t('wallets.usedCredit') : t('wallets.balance')}</span>
                  <b>{hidden ? '••••••' : money.fmt(w.balance)}</b>
                </div>
                <div className="pf">
                  <span className="pname">{ui.prefs.name.toUpperCase()}</span>
                  {networkLogo && (
                    <span className="pbrand">
                      <img
                        className="pbrand-network"
                        src={networkLogo}
                        alt={w.cardNetwork?.toUpperCase()}
                      />
                    </span>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
        {cards.length > 0 && (
          <div className="card-dots">
            {['all', ...cards.map((wallet) => wallet.id)].map((id, index) => (
              <button
                key={id}
                className={index === active ? 'on' : ''}
                onClick={() => goToCard(index)}
                aria-label={index === 0 ? 'Lihat semua dompet' : `Lihat ${cards[index - 1]?.name}`}
              />
            ))}
          </div>
        )}
      </div>

      {current ? (
        <div className="wallet-focus">
          <div className="wallet-focus-head">
            <div>
              <span>Ringkasan dompet</span>
              <strong>{current.name}</strong>
              <div className="wallet-meta">
                {current.bank && <span>{current.bank}</span>}
                {current.last4 && <span>•••• {current.last4}</span>}
                {current.phone && <span>{current.phone}</span>}
                {current.cardNetwork && <span>{current.cardNetwork.toUpperCase()}</span>}
              </div>
            </div>
            <button className="ghost-btn compact" onClick={() => ui.openCreate('wallet', true, current.name, current.id)}><Pencil />Ubah</button>
          </div>

          <div className="wallet-insight-grid wallet-balance-grid">
            {current.kind === 'credit' ? <>
              <div><span>Tagihan bulan sebelumnya</span><b className="out">{money.fmt(previousCreditBill)}</b><small>Tagihan sebelum periode ini dimulai</small></div>
              <div><span>Sisa limit</span><b>{money.fmt(Math.max(0, (current.creditLimit ?? 0) - current.balance))}</b><small>Dari limit total {money.fmt(current.creditLimit ?? 0)}</small></div>
            </> : <>
              <div><span>Saldo</span><b>{money.fmt(current.balance)}</b><small>Total dana di dompet ini</small></div>
              <div><span>Tersedia</span><b>{money.fmt(current.balance - currentReserved)}</b><small>Saldo setelah dikurangi tabungan</small></div>
            </>}
          </div>

          <div className="wallet-period-summary">
            <div className="wallet-period-head">
              <div><span>Arus periode</span><strong>{periodName}</strong></div>
              <small>{periodRange}</small>
            </div>
            <div className="wallet-flow-grid">
              {current.kind === 'credit' ? <>
                <div className="wallet-flow-card income">
                  <span>Pelunasan tagihan bulan sebelumnya</span>
                  <b>{money.fmt(creditPaymentPeriod)}</b>
                  <div><small>Transfer pembayaran masuk</small><strong>{money.fmt(creditPaymentPeriod)}</strong></div>
                </div>
                <div className="wallet-flow-card expense">
                  <span>Pengeluaran bulan ini</span>
                  <b>{money.fmt(actualExpensePeriod)}</b>
                  <div><small>Ditagih di bulan berikutnya</small><strong>{money.fmt(actualExpensePeriod)}</strong></div>
                </div>
              </> : <>
                <div className="wallet-flow-card income">
                  <span>Pemasukan</span>
                  <b>{money.fmt(receivedPeriod)}</b>
                  <div><small>Pemasukan riil</small><strong>{money.fmt(actualIncomePeriod)}</strong></div>
                  <div><small>Transfer masuk & pelunasan piutang</small><strong>{money.fmt(nonRealIncomePeriod)}</strong></div>
                </div>
                <div className="wallet-flow-card expense">
                  <span>Pengeluaran</span>
                  <b>{money.fmt(spentPeriod)}</b>
                  <div><small>Pengeluaran riil</small><strong>{money.fmt(actualExpensePeriod)}</strong></div>
                  <div><small>Transfer keluar</small><strong>{money.fmt(transferOutPeriod)}</strong></div>
                </div>
              </>}
            </div>
            <p>{current.kind === 'credit'
              ? 'Pengeluaran kartu periode ini akan ditagihkan pada bulan berikutnya. Transfer masuk adalah pelunasan tagihan sebelumnya.'
              : 'Pemasukan/pengeluaran riil tidak menghitung transfer antar-dompet. Pelunasan piutang juga tidak dianggap pendapatan baru.'}
            </p>
          </div>

          {selectedSavings.length > 0 && (
            <>
              <div className="sec"><span className="t">Tabungan di dompet ini</span><button className="addg" onClick={() => ui.openCreate('tabungan')}><Plus />{t('common.new')}</button></div>
              {selectedSavings.map((saving) => {
                const pct = saving.target ? Math.min(100, Math.round((saving.balance / saving.target) * 100)) : null;
                return (
                  <div className="plan" key={saving.id} onClick={() => ui.openItem(saving.name, 'tabungan', saving.id)}>
                    <div className="ph"><div><div className="pt">{saving.emoji ? `${saving.emoji} ` : ''}{saving.name}</div><div className="pmeta">Disimpan dari {current.name} · {savingOwnershipLabel(saving.ownership)}</div></div>{pct !== null && <span className="pstatus active">{pct}%</span>}</div>
                    <div className="ptg">{money.fmt(saving.balance)}{saving.target && <small> · target {money.fmtCompact(saving.target)}</small>}</div>
                    {pct !== null && <div className="pbar"><i style={{ width: `${pct}%` }} /></div>}
                  </div>
                );
              })}
            </>
          )}

          <div className="sec"><span className="t">Aktivitas terbaru</span><button className="addg" onClick={() => ui.go('tx')}>Semua transaksi<ChevronR /></button></div>
          {selectedTransactions.slice(0, 6).map((transaction) => {
            const signedAmount = transactionAmount(transaction);
            return (
              <div className="row wallet-activity" key={transaction.id} onClick={() => ui.openItem(transactionTitle(transaction), transaction.type === 'transfer' ? 'transfer' : 'transaksi', transaction.id)}>
                <div className={`ic ${signedAmount > 0 ? 'in' : signedAmount < 0 ? 'out' : ''}`}>
                  {transaction.type === 'income' ? <Down /> : transaction.type === 'transfer' ? <TransferCard /> : <Up />}
                </div>
                <div className="mid"><div className="t1">{transactionTitle(transaction)}</div><div className="t2">
                  {transaction.type === 'income' && (
                    <span className="chip" data-cat="income">
                      {isActualIncome(transaction) ? t('reports.actualIncome') : t('tx.receivableIncome')}
                    </span>
                  )}
                  {transactionDate(transaction.date)}{transaction.labels.length > 0 ? ` · ${transaction.labels.at(-1)}` : ''}
                </div></div>
                <div className="r"><div className={`val ${signedAmount > 0 ? 'in' : signedAmount < 0 ? 'out' : ''}`}>{signedAmount > 0 ? '+' : signedAmount < 0 ? '−' : ''}{money.fmt(Math.abs(signedAmount))}</div></div>
              </div>
            );
          })}
          {selectedTransactions.length === 0 && <div className="saving-empty">Belum ada aktivitas di dompet ini.</div>}
        </div>
      ) : (
      <>
      <div className="all-wallet-insights">
        <div className="wallet-net-card">
          <span>Likuiditas bersih</span>
          <b className={totalLiquidity < 0 ? 'out' : undefined}>{summaryAmount(totalLiquidity)}</b>
          <div className="wallet-net-formula">
            <span><small>Saldo aset</small><strong>{summaryAmount(totalDebit)}</strong></span>
            <i aria-hidden="true">−</i>
            <span><small>Liabilitas</small><strong>{summaryAmount(totalCredit)}</strong></span>
          </div>
        </div>
        <div className="wallet-breakdown-grid">
          <div>
            <span>Dana bebas di dompet</span>
            <b>{summaryAmount(availableDebit)}</b>
            <small>Saldo aset yang belum dialokasikan ke tabungan</small>
          </div>
          <div>
            <span>Dialokasikan ke tabungan</span>
            <b>{summaryAmount(totalReserved)}</b>
            <small>Masih bagian dari saldo aset, tetapi sedang disisihkan</small>
          </div>
          <div>
            <span>Liabilitas kartu kredit</span>
            <b className="out">{summaryAmount(totalCredit)}</b>
            <small>Tagihan berjalan yang mengurangi likuiditas bersih</small>
          </div>
        </div>
      </div>

      <div className="sec"><span className="t">{t('wallets.liquidityDebit')}</span><button className="addg" onClick={() => ui.openCreate('wallet')}><Plus />{t('common.add')}</button></div>
      {debit.length === 0 && (
        <div className="saving-empty">{t('wallets.debitEmpty')}</div>
      )}
      {debit.map(w => {
        const reserved = reservedIn(w.id);
        const medium = mediumOf(w);
        return (
          <div className="row" key={w.id} onClick={() => ui.openItem(w.name, 'wallet', w.id)}>
            {walletListIcon(
              w,
              walletProductInitial(w),
              walletProduct(medium, w.bank)?.color || '#444',
            )}
            <div className="mid">
              <div className="t1">{w.name}{defaultTag(w.id)}</div>
              <div className="t2">
                {medium === 'ewallet'
                  ? (w.phone || t('wallets.ewallet'))
                  : w.last4 ? '•••• ' + w.last4 : t('wallets.physicalWallet')}
              </div>
            </div>
            <div className="r">
              <div className="val">{money.fmt(w.balance)}</div>
              {reserved > 0 && (
                <>
                  <div className="subt">{t('wallets.afterSavings')}: {money.fmt(w.balance - reserved)}</div>
                  <div className="subt">{money.fmt(reserved)} {t('wallets.reservedTag')}</div>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="sec"><span className="t">{t('wallets.savings')}</span><button className="addg" onClick={() => ui.openCreate('tabungan')}><Plus />{t('common.new')}</button></div>
      {savings.length === 0 && (
        <div className="saving-empty">{t('wallets.savingsEmpty')}</div>
      )}
      {savings.map(s => {
        const pct = s.target ? Math.min(100, Math.round((s.balance / s.target) * 100)) : null;
        return (
          <div className="plan" key={s.id} onClick={() => ui.openItem(s.name, 'tabungan', s.id)}>
            <div className="ph">
              <div><div className="pt">{s.emoji ? s.emoji + ' ' : ''}{s.name}</div><div className="pmeta">{t('wallets.savingIn')} {walletName(s.walletId)} · {savingOwnershipLabel(s.ownership)}</div></div>
              {pct !== null && <span className="pstatus active">{pct}%</span>}
            </div>
            <div className="ptg">{money.fmt(s.balance)}{s.target ? <small> · {t('wallets.target')} {money.fmtCompact(s.target)}</small> : <small> · {t('wallets.noTarget')}</small>}</div>
            {pct !== null && <div className="pbar"><i style={{ width: pct + '%' }} /></div>}
          </div>
        );
      })}

      <div className="sec"><span className="t">{t('wallets.liabilityCredit')}</span><button className="addg" onClick={() => ui.openCreate('wallet')}><Plus />{t('common.add')}</button></div>
      {credit.length === 0 && (
        <div className="saving-empty">{t('wallets.creditEmpty')}</div>
      )}
      {credit.map(w => (
        <div className="row" key={w.id} onClick={() => ui.openItem(w.name, 'wallet', w.id)}>
          {walletListIcon(
            w,
            walletProductInitial(w) || 'CC',
            walletProduct(mediumOf(w), w.bank)?.color || '#2F4858',
          )}
          <div className="mid"><div className="t1">{w.name}</div><div className="t2">•••• {w.last4}</div></div>
          <div className="r"><div className="val out">−{money.fmt(w.balance)}</div><div className="subt">{t('wallets.limit')} {money.fmtCompact(w.creditLimit!)}</div></div>
        </div>
      ))}
      </>
      )}
    </>
  );
}
