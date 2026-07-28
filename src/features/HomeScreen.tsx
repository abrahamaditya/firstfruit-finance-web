'use client';
import React from 'react';
import { useUI, useMoney, useT, HOME_SHORTCUTS } from '../components/AppShell';
import { useDashboard, useTransactions, useSubscriptions, useReminders } from '../application/hooks';
import { addDays, billingDatesInRange, dayKey, monthGrid, startOfDay } from '../core/domain/calendar';
import { Up, Down, TransferCard, Plus, Eye, Gauge, Calendar } from '../components/ui/icons';

export default function HomeScreen() {
  const ui = useUI();
  const money = useMoney();
  const tr = useT();
  const d = useDashboard();
  const { data: txs } = useTransactions();
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
    .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
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
  const transactionTitle = (transaction: typeof txs[number]) => {
    if (transaction.type === 'transfer') {
      return `${walletName(transaction.walletId) ?? 'Dompet asal'} → ${walletName(transaction.toWalletId) ?? 'Dompet tujuan'}`;
    }
    return transaction.note || transaction.labels.at(-1) || 'Transaksi';
  };
  const moneyOrHidden = (value: number, compact = false) =>
    hidden ? '••••••' : compact ? money.fmtCompact(value) : money.fmt(value);
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
          <div className="sa">{moneyOrHidden(d.safeToSpend)}</div>
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
      <div className="brk-card">
        <div className="brk-cells">
          <div><span>{tr('home.liquidity')}</span><b>{moneyOrHidden(d.liquidity)}</b></div>
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
                {(t.note ? t.labels : t.labels.slice(0, -1))
                  .map((label) => <span className="chip" key={label}>{label}</span>)}
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
