'use client';
import React from 'react';
import { useUI, useMoney, useT, HOME_SHORTCUTS } from '../components/AppShell';
import { useDashboard, useTransactions } from '../application/hooks';
import { Up, Down, Transfer, Plus, Eye, Gauge, Calendar } from '../components/ui/icons';

export default function HomeScreen() {
  const ui = useUI();
  const money = useMoney();
  const tr = useT();
  const d = useDashboard();
  const { data: txs } = useTransactions();
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

  const txIcon = (type: string) => (type === 'income' ? <Up /> : type === 'transfer' ? <Transfer /> : <Down />);
  const txDir = (type: string) => (type === 'income' ? 'in' : type === 'transfer' ? '' : 'out');
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
      value: String(d.progress?.daysLeft ?? 0),
      label: tr('home.daysLeft'),
      tone: 'info',
      icon: <Calendar />,
    },
  ] as const;
  const activeHighlight = highlights[highlightIndex];

  return (
    <>
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
          <div><span>{tr('home.liquidity')}</span><b>{moneyOrHidden(d.liquidity, true)}</b></div>
          <div>
            <span>{tr('home.inSavings')}</span>
            <b>{hidden ? '••••' : `${d.reserved > 0 ? '−' : ''}${money.fmtCompact(d.reserved)}`}</b>
          </div>
          <div>
            <span>{tr('home.allocated')}</span>
            <b>{hidden ? '••••' : `${d.allocated > 0 ? '−' : ''}${money.fmtCompact(d.allocated)}`}</b>
          </div>
        </div>
        {d.progress && (
          <div className="card-foot">
            <div className="brk-bar"><i style={{ width: (d.progress.fraction * 100).toFixed(0) + '%' }} /></div>
            <span>{d.progress.dayOf}/{d.progress.totalDays} {tr('home.days')} · {d.progress.daysLeft} {tr('home.daysLeft')}</span>
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
          <div className="row" key={t.id} onClick={() => ui.openItem(t.note || tr('home.txFallback'), t.type === 'transfer' ? 'transfer' : 'transaksi', t.id)}>
            <div className={'ic ' + txDir(t.type)}>{txIcon(t.type)}</div>
            <div className="mid">
              <div className="t1">{t.note}</div>
              <div className="t2">{t.labels[0] && <span className="chip">{t.labels[0]}</span>}{dateLabel(t.date)}</div>
            </div>
            <div className="r"><div className={'val ' + txDir(t.type)}>{fmtTx(t)}</div></div>
          </div>
        ))}
      </div>
    </>
  );
}
