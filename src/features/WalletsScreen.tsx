'use client';
import React, { useRef, useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useWallets, useSavings } from '../application/hooks';
import { ChevronR, Card, Eye, Recur, Plus } from '../components/ui/icons';

const color: Record<string, string> = { BCA: '#1a4ea3', 'blu by BCA': '#0a8cd4', GoPay: '#00aa13', OVO: '#4c2a86', Tunai: 'var(--emerald)', 'Kartu Kredit BCA': '#2F4858' };
const initials = (n: string) => n.split(' ')[0].slice(0, 3);
const mediumOf = (w: { medium?: string; kind: string }) => w.medium ?? (w.kind === 'credit' ? 'credit' : 'bank');

export default function WalletsScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const { wallets } = useWallets();
  const { savings, reservedIn } = useSavings();
  const debit = wallets.filter(w => w.kind === 'debit');
  const credit = wallets.filter(w => w.kind === 'credit');
  const walletName = (id: string) => wallets.find(w => w.id === id)?.name ?? 'dompet';
  const [hidden, setHidden] = useState(false);
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Kartu diurutkan: kredit dulu (paling sering dilihat nomornya), lalu debit & e-wallet.
  const cards = [...credit, ...debit];
  const current = cards[Math.min(active, cards.length - 1)];
  const currentReserved = current ? reservedIn(current.id) : 0;

  // Track punya padding (zona pudar di tepi), jadi patokannya lebar slide, bukan
  // clientWidth: slide ke-n selalu berhenti pas di scrollLeft = n × lebar slide.
  const slideWidth = () => (trackRef.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
  // Scroll selalu memperbarui kartu aktif — di ponsel berarti kartu yang sedang dilihat,
  // di deret desktop kartu paling kiri. Titik indikator ikut bergerak di keduanya.
  const onScroll = () => {
    const track = trackRef.current;
    const width = slideWidth();
    if (!track || !width) return;
    const index = Math.round(track.scrollLeft / width);
    setActive(prev => (prev === index ? prev : index));
  };
  const goToCard = (index: number) => {
    setActive(index);
    trackRef.current?.scrollTo({ left: index * slideWidth(), behavior: 'smooth' });
  };

  const cardSubtitle = (w: typeof cards[number]) => {
    const medium = mediumOf(w);
    if (medium === 'ewallet') return w.phone ? (hidden ? '••••••••' : w.phone) : t('wallets.ewallet');
    if (medium === 'cash') return t('wallets.physicalWallet');
    return `•••• •••• •••• ${hidden ? '••••' : w.last4 || '••••'}`;
  };
  const cardBrand = (w: typeof cards[number]) => {
    const medium = mediumOf(w);
    return medium === 'credit' ? 'VISA' : medium === 'ewallet' ? 'E-WALLET' : medium === 'cash' ? 'CASH' : 'DEBIT';
  };

  return (
    <>
      <div className="card-stack">
        <div className="card-track" ref={trackRef} onScroll={onScroll}>
          {cards.map((w, index) => (
            <div className="card-slide" key={w.id}>
              <div
                className={`paycard${mediumOf(w) === 'credit' ? ' credit' : ''}${
                  index === active ? '' : index < active ? ' behind before' : ' behind after'
                }`}
                onClick={() => { setActive(index); ui.openItem(w.name, 'wallet', w.id); }}
              >
                <div className="pt"><span className="pb">{w.name}</span><span className="pchip" /></div>
                <div className="pn">{cardSubtitle(w)}</div>
                <div className="pbal">
                  <span>{mediumOf(w) === 'credit' ? t('wallets.usedCredit') : t('wallets.balance')}</span>
                  <b>{hidden ? '••••••' : money.fmt(w.balance)}</b>
                </div>
                <div className="pf">
                  <span className="pname">{ui.prefs.name.toUpperCase()}</span>
                  <span className="pbrand">{cardBrand(w)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {cards.length > 1 && (
          <div className="card-dots">
            {cards.map((w, index) => (
              <button
                key={w.id}
                className={index === active ? 'on' : ''}
                onClick={() => goToCard(index)}
                aria-label={`Lihat ${w.name}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Deret aksi bundar yang sama dengan pintasan beranda — `center` karena isinya
          hanya tiga, tidak mengisi satu baris penuh. */}
      <div className="qa center">
        <button className="qa-btn" onClick={() => { setHidden(h => !h); ui.notify(hidden ? t('wallets.cardShown') : t('wallets.cardHidden')); }}>
          <span className="qa-ic"><Eye /></span><span>{hidden ? t('wallets.show') : t('wallets.hide')}</span>
        </button>
        <button className="qa-btn" onClick={() => ui.openCreate('wallet', true, current?.name, current?.id)}>
          <span className="qa-ic"><Card /></span><span>{t('common.edit')}</span>
        </button>
        <button className="qa-btn" onClick={() => ui.openCreate('wallet')}>
          <span className="qa-ic"><Plus /></span><span>{t('common.add')}</span>
        </button>
      </div>

      {current && currentReserved > 0 && (
        <div className="wbreak">
          <div><div className="k">{t('wallets.available')}</div><div className="v">{money.fmt(current.balance - currentReserved)}</div></div>
          <div><div className="k">{t('wallets.reserved')}</div><div className="v lock">{money.fmt(currentReserved)}</div></div>
        </div>
      )}

      <div className="sec"><span className="t">{t('wallets.manageCard')}</span></div>
      <div className="card manage">
        <button className="mrow" onClick={() => ui.openCreate('wallet', true, current?.name, current?.id)}><div className="mi"><Card /></div><div className="mm"><div className="ml">{t('wallets.paymentMethod')}</div><div className="ms">{current?.name}</div></div><span className="mc"><ChevronR /></span></button>
        <button className="mrow" onClick={() => ui.go('subs')}><div className="mi"><Recur /></div><div className="mm"><div className="ml">{t('wallets.subsViaCard')}</div><div className="ms">{t('wallets.subsCount')}</div></div><span className="mc"><ChevronR /></span></button>
      </div>

      <div className="sec"><span className="t">{t('wallets.liquidityDebit')}</span><button className="addg" onClick={() => ui.openCreate('wallet')}><Plus />{t('common.add')}</button></div>
      {debit.map(w => {
        const reserved = reservedIn(w.id);
        const medium = mediumOf(w);
        return (
          <div className="row" key={w.id} onClick={() => ui.openItem(w.name, 'wallet', w.id)}>
            <div className="lg" style={{ background: color[w.name] || '#444' }}>{initials(w.name)}</div>
            <div className="mid">
              <div className="t1">{w.name}</div>
              <div className="t2">
                {medium === 'ewallet'
                  ? (w.phone || t('wallets.ewallet'))
                  : w.last4 ? '•••• ' + w.last4 : t('wallets.physicalWallet')}
              </div>
            </div>
            <div className="r"><div className="val">{money.fmt(w.balance)}</div>{reserved > 0 && <div className="subt">🔒 {money.fmtCompact(reserved)} {t('wallets.reservedTag')}</div>}</div>
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
              <div><div className="pt">{s.emoji ? s.emoji + ' ' : ''}{s.name}</div><div className="pmeta">{t('wallets.savingIn')} {walletName(s.walletId)}</div></div>
              {pct !== null && <span className="pstatus active">{pct}%</span>}
            </div>
            <div className="ptg">{money.fmt(s.balance)}{s.target ? <small> · {t('wallets.target')} {money.fmtCompact(s.target)}</small> : <small> · {t('wallets.noTarget')}</small>}</div>
            {pct !== null && <div className="pbar"><i style={{ width: pct + '%' }} /></div>}
          </div>
        );
      })}

      <div className="sec"><span className="t">{t('wallets.liabilityCredit')}</span></div>
      {credit.map(w => (
        <div className="row" key={w.id} onClick={() => ui.openItem(w.name, 'wallet', w.id)}>
          <div className="lg" style={{ background: color[w.name] || '#2F4858' }}>CC</div>
          <div className="mid"><div className="t1">{w.name}</div><div className="t2">•••• {w.last4}</div></div>
          <div className="r"><div className="val out">−{money.fmt(w.balance)}</div><div className="subt">{t('wallets.limit')} {money.fmtCompact(w.creditLimit!)}</div></div>
        </div>
      ))}
    </>
  );
}
