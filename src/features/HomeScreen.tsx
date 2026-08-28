'use client';
import React from 'react';
import { useUI, useMoney, useT, HOME_SHORTCUTS } from '../components/AppShell';
import { useActivePeriodTransactions, useDashboard, useSubscriptions, useReminders, useSavings } from '../application/hooks';
import { addDays, billingDatesInRange, dayKey, monthGrid, startOfDay } from '../core/domain/calendar';
import { Up, Down, TransferCard, Plus, Eye, Gauge, Calendar, ChevronR } from '../components/ui/icons';
import { walletBrandLogo, walletProductInitial } from '../core/wallet-branding';
import { isActualIncome } from '../core/domain/calculations';
import { categoryTone } from '../core/domain/categories';

const randomScramble = (value: string, lockedDigits = 0) => {
  let digitIndex = 0;
  return value.replace(/\d/g, (digit) => {
    const locked = digitIndex < lockedDigits;
    digitIndex += 1;
    return locked ? digit : String(Math.floor(Math.random() * 10));
  });
};

/**
 * Nominal mengacak digit selama data dimuat, lalu mengunci digit kiri-ke-kanan ke
 * nilai sebenarnya. Tanda, mata uang, dan pemisah ribuan tidak ikut berubah.
 */
function useGlitchAmount(target: string, loadingTemplate: string, loading: boolean, enabled: boolean) {
  const [display, setDisplay] = React.useState(target);
  const fetchedThisMount = React.useRef(loading);

  React.useEffect(() => {
    if (!enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fetchedThisMount.current = false;
      setDisplay(target);
      return;
    }

    if (loading) {
      fetchedThisMount.current = true;
      setDisplay(randomScramble(loadingTemplate));
      const interval = window.setInterval(() => {
        setDisplay(randomScramble(loadingTemplate));
      }, 48);
      return () => window.clearInterval(interval);
    }

    // Data dari cache langsung ditampilkan. Fase settle hanya dijalankan bila beranda
    // ini sebelumnya benar-benar mengalami fetch, bukan sekadar di-mount ulang.
    if (!fetchedThisMount.current) {
      setDisplay(target);
      return;
    }
    fetchedThisMount.current = false;

    const duration = 680;
    const startedAt = performance.now();
    const digitCount = (target.match(/\d/g) ?? []).length;
    let timeout = 0;
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / duration);
      if (progress === 1) {
        setDisplay(target);
        return;
      }
      // Sepertiga awal tetap liar; setelah itu digit menetap bertahap dari kiri.
      const settleProgress = Math.max(0, (progress - 0.34) / 0.66);
      setDisplay(randomScramble(target, Math.floor(settleProgress * digitCount)));
      timeout = window.setTimeout(tick, 44);
    };
    tick();
    return () => window.clearTimeout(timeout);
  }, [enabled, loading, loadingTemplate, target]);

  return display;
}

const MARQUEE_SPEED = 28;        // piksel/detik, menyamai laju animasi CSS sebelumnya
const MARQUEE_RESUME = 2600;     // jeda sebelum jalan sendiri lagi setelah disentuh
const MARQUEE_MAX_FLING = 2600;  // batas kecepatan lemparan, px/detik

/**
 * Deret dompet berjalan yang bisa diambil alih: seret dengan tetikus atau jari, geser
 * mendatar dengan trackpad, lalu ia melambat dan kembali berjalan sendiri.
 *
 * Posisinya dihitung sendiri lewat transform per frame, bukan animasi CSS, karena animasi
 * CSS tidak punya posisi yang bisa dibaca maupun digeser di tengah jalan. `renderSet`
 * dipanggil dua kali: salinan kedua yang menutup celah saat posisi mendekati ujung set
 * pertama, dan hanya dibuat kalau deretnya memang lebih panjang dari kartunya.
 */
function WalletMarquee({ label, renderSet }: {
  label: string;
  renderSet: (duplicate?: boolean) => React.ReactNode;
}) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const state = React.useRef({
    offset: 0, velocity: 0, setWidth: 0,
    dragging: false, pointerId: -1, lastX: 0, lastTime: 0,
    hold: 0, hover: false,
  });

  // Lebar satu set jadi dua hal sekaligus: periode pembungkusan posisi, dan penentu
  // apakah deretnya perlu berjalan sama sekali.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const measure = () => {
      const set = track.firstElementChild as HTMLElement | null;
      state.current.setWidth = set?.offsetWidth ?? 0;
      setScrollable(state.current.setWidth > viewport.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!scrollable) {
      if (track) track.style.transform = '';
      state.current.offset = 0;
      state.current.velocity = 0;
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let previous = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const s = state.current;
      // Frame yang tertinggal (tab di latar, jank) dibatasi supaya deretnya tidak melompat.
      const delta = Math.min(0.064, (now - previous) / 1000);
      previous = now;
      if (!s.dragging) {
        if (Math.abs(s.velocity) > 6) {
          s.offset += s.velocity * delta;
          s.velocity *= Math.pow(0.0016, delta);
        } else {
          s.velocity = 0;
          if (!s.hover && now >= s.hold && !reduced.matches) s.offset -= MARQUEE_SPEED * delta;
        }
      }
      const period = s.setWidth || 1;
      s.offset = ((s.offset % period) + period) % period;
      if (trackRef.current) trackRef.current.style.transform = `translate3d(${-s.offset}px,0,0)`;
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollable]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrollable || event.button > 0) return;
    const s = state.current;
    s.dragging = true;
    s.pointerId = event.pointerId;
    s.lastX = event.clientX;
    s.lastTime = event.timeStamp;
    s.velocity = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s.dragging || event.pointerId !== s.pointerId) return;
    const dx = event.clientX - s.lastX;
    const dt = Math.max(8, event.timeStamp - s.lastTime);
    s.offset -= dx;
    // Kecepatan dihaluskan antar sampel: satu frame pendek yang kebetulan besar
    // tidak boleh menentukan sendiri seberapa jauh lemparannya meluncur.
    s.velocity = s.velocity * 0.7 + (-dx / (dt / 1000)) * 0.3;
    s.lastX = event.clientX;
    s.lastTime = event.timeStamp;
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s.dragging || event.pointerId !== s.pointerId) return;
    s.dragging = false;
    s.pointerId = -1;
    s.hold = performance.now() + MARQUEE_RESUME;
    // Jari yang berhenti dulu sebelum diangkat berarti menaruh, bukan melempar.
    s.velocity = event.timeStamp - s.lastTime > 90
      ? 0
      : Math.max(-MARQUEE_MAX_FLING, Math.min(MARQUEE_MAX_FLING, s.velocity));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  // Geser mendatar trackpad/roda mendatar. Hanya diambil saat sumbu X yang dominan,
  // supaya gulir vertikal halaman tidak ikut tertahan di atas kartu ini.
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!scrollable || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    s.offset += event.deltaX;
    s.velocity = 0;
    s.hold = performance.now() + MARQUEE_RESUME;
  };

  return (
    <div
      ref={viewportRef}
      className={`home-wallet-marquee${scrollable ? '' : ' is-static'}${dragging ? ' is-dragging' : ''}`}
      role="group"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
      onMouseEnter={() => { state.current.hover = true; }}
      onMouseLeave={() => { state.current.hover = false; }}
    >
      <div className="home-wallet-track" ref={trackRef}>
        {renderSet()}
        {scrollable ? renderSet(true) : null}
      </div>
    </div>
  );
}

export default function HomeScreen() {
  const ui = useUI();
  const money = useMoney();
  const tr = useT();
  const d = useDashboard();
  const { data: txs } = useActivePeriodTransactions();
  const { all: savings, reservedIn } = useSavings();
  const { subs } = useSubscriptions();
  const { reminders } = useReminders();
  const recent = txs.slice(0, 4);
  const hidden = ui.prefs.hideHomeAmounts;
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const [highlightPaused, setHighlightPaused] = React.useState(false);

  React.useEffect(() => {
    if (highlightPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setHighlightIndex((current) => (current + 1) % 4);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [highlightPaused]);

  // formatIDR memakai Math.abs, jadi tanda harus dipasang sendiri — kalau nilai negatif
  // diteruskan apa adanya, angka >= 1 juta akan tampil dobel minus dan yang di bawahnya hilang tanda.
  const signed = (n: number) => (n < 0 ? '−' : n > 0 ? '+' : '') + money.fmtCompact(Math.abs(n));
  const fmtTx = (t: { type: string; amount: number }) =>
    (t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '') + money.fmt(t.amount);

  // Perubahan bersih hari ini. Transfer dilewati: memindahkan uang antar dompet tidak
  // mengubah kekayaan, jadi tidak boleh muncul sebagai naik/turun.
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const todayNet = txs
    .filter(t => !t.adjustment && t.type !== 'transfer' && new Date(t.date) >= midnight)
    .reduce((sum, t) => sum + (isActualIncome(t) ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
  const sevenDaysAgo = new Date(midnight);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaySpending = txs
    .filter(t => !t.adjustment && t.type === 'expense' && new Date(t.date) >= sevenDaysAgo)
    .reduce((sum, t) => sum + t.amount, 0);
  const daysLeft = Math.max(1, d.progress?.daysLeft ?? 1);
  const safePerDay = Math.max(0, Math.floor(d.safeToSpend / daysLeft));

  const dateLabel = (iso: string) => {
    const days = Math.round((midnight.getTime() - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
    if (days <= 0) return tr('home.dToday');
    if (days === 1) return tr('home.dYesterday');
    return tr('home.dDaysAgo', { n: days });
  };

  const shortcuts = ui.prefs.homeTools
    .map(id => HOME_SHORTCUTS.find(entry => entry.id === id))
    .filter((entry): entry is typeof HOME_SHORTCUTS[number] => Boolean(entry));

  // ===== Agenda kolom kanan (hanya dirender di layar lebar, lihat .home-aside) =====
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const today = startOfDay(midnight);
  const todayKey = dayKey(today);
  const calDays = monthGrid(today);
  const monthLabel = today.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  // Jumlah jadwal per tanggal, dipakai untuk titik di bawah angka. Tagihan langganan
  // diturunkan dari siklusnya, bukan cuma nextBillingDate, supaya seluruh kisi terisi.
  const scheduled = new Map<string, number>();
  const bump = (key: string) => scheduled.set(key, (scheduled.get(key) ?? 0) + 1);
  subs.forEach(sub =>
    billingDatesInRange(sub, calDays[0], calDays[calDays.length - 1]).forEach(date => bump(dayKey(date))),
  );
  reminders.filter(item => !item.done).forEach(item => bump(dayKey(item.date)));

  // Empat jadwal terdekat ke depan. Rentangnya dibatasi 60 hari supaya langganan tahunan
  // tidak memenuhi daftar dengan tanggal yang masih jauh.
  const horizon = addDays(today, 60);
  const upcoming = [
    ...subs.flatMap(sub =>
      billingDatesInRange(sub, today, horizon).map(date => ({
        id: `${sub.id}-${dayKey(date)}`, rawId: sub.id, date, title: sub.name,
        amount: sub.amount, kind: 'bill' as const,
      })),
    ),
    ...reminders
      .filter(item => !item.done && new Date(item.date) >= today && new Date(item.date) <= horizon)
      .map(item => ({
        id: item.id, rawId: item.id, date: new Date(item.date), title: item.title,
        amount: item.amount ?? 0, kind: 'todo' as const,
      })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 4);

  const txIcon = (type: string) => (type === 'income' ? <Down /> : type === 'transfer' ? <TransferCard /> : <Up />);
  const txDir = (type: string) => (type === 'income' ? 'in' : type === 'transfer' ? '' : 'out');
  const walletName = (id?: string) => d.wallets.find((wallet) => wallet.id === id)?.name;
  const savingName = (id?: string) => id ? savings.find((saving) => saving.id === id)?.name : undefined;
  // Urutan saldo di Beranda mengikuti carousel Dompet. Dompet yang belum pernah masuk
  // daftar urutan tetap disisipkan setelahnya menurut urutan bawaan yang stabil.
  const debitWallets = d.wallets.filter((wallet) => wallet.kind === 'debit');
  const creditWallets = d.wallets.filter((wallet) => wallet.kind === 'credit');
  const primaryDebit = debitWallets.find((wallet) => wallet.id === ui.prefs.defaultWalletId)
    ?? debitWallets[0];
  const defaultWalletOrder = primaryDebit
    ? [primaryDebit, ...debitWallets.filter((wallet) => wallet.id !== primaryDebit.id), ...creditWallets]
    : creditWallets;
  const walletOrderRank = new Map(ui.prefs.walletOrder.map((id, index) => [id, index]));
  const walletBalances = [...defaultWalletOrder].sort((a, b) => {
    const aRank = walletOrderRank.get(a.id);
    const bRank = walletOrderRank.get(b.id);
    if (aRank == null && bRank == null) return defaultWalletOrder.indexOf(a) - defaultWalletOrder.indexOf(b);
    if (aRank == null) return 1;
    if (bRank == null) return -1;
    return aRank - bRank;
  });
  const walletTicker = (duplicate = false) => (
    <div className="home-wallet-set" aria-hidden={duplicate || undefined}>
      {walletBalances.map((wallet) => {
        const logo = walletBrandLogo(wallet);
        const creditPeriodTransactions = wallet.kind === 'credit'
          ? txs.filter((transaction) => transaction.walletId === wallet.id || transaction.toWalletId === wallet.id)
          : [];
        const creditExpense = creditPeriodTransactions
          .filter((transaction) => !transaction.adjustment
            && transaction.type === 'expense'
            && transaction.walletId === wallet.id)
          .reduce((sum, transaction) => sum + transaction.amount, 0);
        const creditPayment = creditPeriodTransactions
          .filter((transaction) => !transaction.adjustment
            && transaction.type === 'transfer'
            && transaction.toWalletId === wallet.id)
          .reduce((sum, transaction) => sum + transaction.amount, 0);
        const displayBalance = wallet.kind === 'credit'
          ? Math.max(0, (wallet.creditLimit ?? 0) - Math.max(
            0,
            (wallet.previousPeriodBill ?? 0) - creditPayment + creditExpense,
          ))
          : wallet.balance - reservedIn(wallet.id);
        const amount = hidden
          ? '••••'
          : money.fmt(displayBalance);
        const walletLabel = wallet.kind === 'credit' ? `Sisa limit · ${wallet.name}` : wallet.name;
        return (
          <span
            className="home-wallet-item"
            key={`${duplicate ? 'copy-' : ''}${wallet.id}`}
            title={`${walletLabel} · ${amount}`}
            aria-label={`${walletLabel} · ${amount}`}
          >
            <span className={`home-wallet-mark${logo ? ' has-image' : ''}${wallet.medium === 'cash' ? ' is-cash' : ''}`}>
              {logo
                ? <img src={logo} alt="" aria-hidden="true" />
                : walletProductInitial(wallet)}
            </span>
            <span className="home-wallet-copy">
              <small>{walletLabel}</small>
              <b className="home-wallet-nominal">{amount}</b>
            </span>
          </span>
        );
      })}
    </div>
  );
  const transactionTitle = (transaction: typeof txs[number]) => {
    if (transaction.type === 'transfer') {
      return `${walletName(transaction.walletId) ?? 'Dompet asal'} → ${walletName(transaction.toWalletId) ?? 'Dompet tujuan'}`;
    }
    return transaction.note || transaction.labels.at(-1) || 'Transaksi';
  };
  const moneyOrHidden = (value: number, compact = false) =>
    hidden ? '••••••' : compact ? money.fmtCompactSigned(value) : money.fmtSigned(value);
  const safeAmount = moneyOrHidden(d.safeToSpend);
  const loadingSafeAmount = money.fmtSigned(d.safeToSpend || 8_888_888);
  const safeAmountGlitch = useGlitchAmount(safeAmount, loadingSafeAmount, d.loading, !hidden);
  const highlights = [
    {
      value: hidden ? '••••' : signed(todayNet),
      label: tr('home.todayNet'),
      tone: todayNet > 0 ? 'up' : todayNet < 0 ? 'down' : 'neutral',
      icon: todayNet < 0 ? <Down /> : <Up />,
    },
    {
      value: hidden ? '••••' : money.fmtCompact(safePerDay),
      label: tr('home.safePerDay'),
      tone: 'up',
      icon: <Gauge />,
    },
    {
      value: hidden ? '••••' : money.fmtCompact(sevenDaySpending),
      label: tr('home.spentSevenDays'),
      tone: 'warn',
      icon: <Down />,
    },
    {
      // Dijepit di 0: periodProgress sengaja mengembalikan nilai negatif untuk periode
      // yang lewat tanggal, tapi kapsul ini hanya memajang angka tanpa konteks.
      value: String(Math.max(0, d.progress?.daysLeft ?? 0)),
      label: tr('home.daysLeft'),
      tone: 'info',
      icon: <Calendar />,
    },
  ] as const;
  const activeHighlight = highlights[highlightIndex];

  return (
    /* .home-grid hanya berperan di layar lebar: di sana ia jadi dua kolom, konten di kiri dan
       agenda di kanan. Di bawah 1240px ia blok biasa dan .home-aside disembunyikan, jadi
       tata letak ponsel/desktop sempit tidak berubah sama sekali. */
    <div className="home-grid">
      <div className="home-lead">
      {/* Blok pembuka memakai .shero — pola yang sama dengan Anggaran, Piutang, Langganan. */}
      <div className="shero home-hero">
        <div className="sl">{tr('home.safeToSpend')}</div>
        <div className="sa-wrap">
          <div
            className={`sa${d.safeToSpend < 0 ? ' negative' : ''}`}
            aria-label={hidden ? 'Nominal disembunyikan' : safeAmount}
          >
            <span aria-hidden="true">{safeAmountGlitch}</span>
          </div>
          <button
            className={`hero-eye${hidden ? ' on' : ''}`}
            onClick={() => ui.setPref('hideHomeAmounts', !hidden)}
            aria-label={hidden ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
            title={hidden ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
          >
            <Eye />
          </button>
        </div>
        <div
          className="hero-highlights"
          onMouseEnter={() => setHighlightPaused(true)}
          onMouseLeave={() => setHighlightPaused(false)}
        >
          <div className={`hero-highlight ${activeHighlight.tone}`} key={highlightIndex}>
            <span className="hero-highlight-icon" aria-hidden="true">{activeHighlight.icon}</span>
            <span className={`sbadge ${activeHighlight.tone}`}>{activeHighlight.value}</span>
            <span className="sp-label">{activeHighlight.label}</span>
          </div>
        </div>
      </div>

      {/* Kartu total: menjabarkan asal angka besar di atas. Ketiga sel selalu tampil supaya
          struktur kartu tetap; tanda minus hanya dipasang saat nilainya ada, karena
          "−Rp 0" membingungkan sedangkan "Rp 0" jelas. */}
      <div className="home-summary-row">
        <div className="brk-card">
          <div className="brk-cells home-cashflow-breakdown">
            <div><span>{tr('home.assets')}</span><b>{moneyOrHidden(d.assets)}</b></div>
            <div>
              <span>{tr('home.creditBills')}</span>
              <b>{hidden ? '••••' : `${d.creditLiabilities > 0 ? '−' : ''}${money.fmt(d.creditLiabilities)}`}</b>
              <small>{hidden ? '••••' : tr('home.creditBillBreakdown', {
                previous: money.fmtCompact(d.previousPeriodCreditDue),
                current: money.fmtCompact(d.currentPeriodCreditDue),
              })}</small>
            </div>
            <div>
              <span>{tr('home.inSavings')}</span>
              <b>{hidden ? '••••' : `${d.reserved > 0 ? '−' : ''}${money.fmt(d.reserved)}`}</b>
            </div>
            <div>
              <span>{tr('home.allocated')}</span>
              <b>{hidden ? '••••' : `${d.allocated > 0 ? '−' : ''}${money.fmt(d.allocated)}`}</b>
            </div>
          </div>
          {d.progress && (
            <div className="card-foot">
              <div className="brk-bar"><i style={{ width: (d.progress.fraction * 100).toFixed(0) + '%' }} /></div>
              <span>{d.progress.dayOf}/{d.progress.totalDays} {tr('home.days')} · {Math.max(0, d.progress.daysLeft)} {tr('home.daysLeft')}</span>
            </div>
          )}
        </div>
        <div className="home-wallet-card">
          <div className="home-wallet-card-head">
            <span>{tr('home.walletBalances')}</span>
            <button type="button" onClick={() => ui.go('wallets')}>
              {tr('common.seeAll')}<ChevronR />
            </button>
          </div>
          {walletBalances.length > 0 ? (
            <WalletMarquee label={tr('home.walletBalances')} renderSet={walletTicker} />
          ) : (
            <div className="home-wallet-empty">{tr('home.noWalletBalances')}</div>
          )}
        </div>
      </div>

      {/* Deret aksi = pintasan pilihan pengguna. Tombol putus-putus di ujung membuka
          pemilihnya, jadi yang diatur adalah deret ini sendiri. */}
      <div className="qa">
        {shortcuts.map(entry => (
          <button
            className="qa-btn"
            key={entry.id}
            onClick={() => (entry.create ? ui.openCreate(entry.create) : ui.go(entry.tab!))}
          >
            <span className="qa-ic">{entry.icon}</span><span>{tr(entry.label)}</span>
          </button>
        ))}
        <button className="qa-btn" onClick={ui.openTools}>
          <span className="qa-ic dashed"><Plus /></span><span>{tr('home.toolsEdit')}</span>
        </button>
      </div>

      {/* ==== Panel: menutup wash dengan sudut membulat + grabber ==== */}
      <div className="home-panel">
        <div className="panel-grab" />

        <div className="sec"><span className="t">{tr('home.recent')}</span>
          <button className="addg" onClick={() => ui.go('tx')}>{tr('common.seeAll')}</button></div>
        {recent.map(t => (
          <div className="row" key={t.id} onClick={() => ui.openItem(transactionTitle(t), t.type === 'transfer' ? 'transfer' : 'transaksi', t.id)}>
            <div className={'ic ' + txDir(t.type)}>{txIcon(t.type)}</div>
            <div className="mid">
              <div className="t1">{transactionTitle(t)}</div>
              <div className="t2">
                {t.type === 'income' && (
                  <span className="chip" data-cat="income">
                    {isActualIncome(t) ? tr('reports.actualIncome') : tr('tx.receivableIncome')}
                  </span>
                )}
                {(t.note ? t.labels : t.labels.slice(0, -1))
                  .map((label) => (
                    <span className="chip" data-cat={categoryTone(label)} key={label}>{label}</span>
                  ))}
                {t.type === 'transfer' && t.savingId && (
                  <span className="chip saving-destination">Tabungan · {savingName(t.savingId) ?? 'Tabungan'}</span>
                )}
                {dateLabel(t.date)}
              </div>
            </div>
            <div className="r"><div className={'val ' + txDir(t.type)}>{fmtTx(t)}</div></div>
          </div>
        ))}
        {recent.length === 0 && (
          <div className="home-recent-empty">
            <b>{tr('home.recentEmptyTitle')}</b>
            <p>{tr('home.recentEmptyBody')}</p>
          </div>
        )}
      </div>
      </div>

      <aside className="home-aside">
        <div className="sec"><span className="t">{tr('home.agenda')}</span>
          <button className="addg" onClick={() => ui.go('calendar')}>{tr('common.seeAll')}</button></div>
        <div className="mini-cal">
          <div className="mini-cal-head">
            <b>{monthLabel}</b>
            <button className="addg" onClick={() => ui.openCreate('reminder', false, dayKey(today))}>
              <Plus />{tr('cal.reminder')}
            </button>
          </div>
          <div className="mini-cal-grid">
            {calDays.slice(0, 7).map(day => (
              <div className="mini-cal-dow" key={`dow-${day.getTime()}`}>
                {day.toLocaleDateString(locale, { weekday: 'narrow' })}
              </div>
            ))}
            {calDays.map(day => {
              const key = dayKey(day);
              return (
                <button
                  key={key}
                  className={`mini-cal-day${day.getMonth() === today.getMonth() ? '' : ' out'}${key === todayKey ? ' today' : ''}${scheduled.has(key) ? ' has' : ''}`}
                  onClick={() => ui.go('calendar')}
                  title={scheduled.has(key) ? `${scheduled.get(key)} jadwal` : undefined}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {upcoming.length === 0 ? (
          <div className="agenda-empty">{tr('home.agendaEmpty')}</div>
        ) : (
          <div className="agenda-list">
            {upcoming.map(item => (
              <button
                className="agenda-item"
                key={item.id}
                onClick={() => (item.kind === 'todo' ? ui.openItem(item.title, 'reminder', item.rawId) : ui.go('subs'))}
              >
                <span className="agenda-date">
                  <b>{item.date.getDate()}</b>
                  <span>{item.date.toLocaleDateString(locale, { month: 'short' })}</span>
                </span>
                <span className="agenda-copy">
                  <b>{item.title}</b>
                  <span>{tr(item.kind === 'bill' ? 'home.agendaBill' : 'home.agendaTodo')}</span>
                </span>
                {item.amount ? <span className="agenda-amt">{money.fmtCompact(item.amount)}</span> : null}
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
