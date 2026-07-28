'use client';
import React, { useRef, useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useWallets, useSavings } from '../application/hooks';
import { Eye, EyeOff, Pencil, Plus, WalletIcon } from '../components/ui/icons';

const color: Record<string, string> = { BCA: '#1a4ea3', 'blu by BCA': '#0a8cd4', GoPay: '#00aa13', OVO: '#4c2a86', Tunai: 'var(--emerald)', 'Kartu Kredit BCA': '#2F4858' };
const initials = (n: string) => n.split(' ')[0].slice(0, 3);
const mediumOf = (w: { medium?: string; kind: string }) => w.medium ?? (w.kind === 'credit' ? 'credit' : 'bank');
const networkLogos = {
  visa: { src: '/brand/visa-logo.png', alt: 'Visa' },
  mastercard: { src: '/brand/martercard-logo.png', alt: 'Mastercard' },
  gpn: { src: '/brand/gpn-logo.png', alt: 'GPN' },
} as const;
const walletLogos = [
  { names: ['blu'], src: '/brand/blu-logo.png', alt: 'blu' },
  { names: ['gopay'], src: '/brand/gopay-logo.png', alt: 'GoPay' },
  { names: ['ovo'], src: '/brand/ovo-logo.png', alt: 'OVO' },
  { names: ['dana'], src: '/brand/dana-logo.png', alt: 'DANA' },
  { names: ['shopeepay', 'shopee pay'], src: '/brand/shopeepay-logo.png', alt: 'ShopeePay' },
  { names: ['flazz'], src: '/brand/flazz-logo.png', alt: 'Flazz' },
  { names: ['livin', 'mandiri'], src: '/brand/livin-mandiri-logo.png', alt: 'Livin’ by Mandiri' },
] as const;

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
  const brandLogo = (w: typeof cards[number]) => {
    if (mediumOf(w) === 'cash') {
      return { src: '/brand/dompet-logo.png', alt: 'Uang Tunai' } as const;
    }
    const network = w.cardNetwork ? networkLogos[w.cardNetwork] : undefined;
    if (network) return network;
    const identity = `${w.name} ${w.bank ?? ''}`.toLowerCase();
    return walletLogos.find(logo => logo.names.some(name => identity.includes(name)));
  };
  const walletListIcon = (w: typeof cards[number], fallback: string, background: string) => {
    const logo = brandLogo(w);
    return (
      <div className={`lg${logo ? ' has-logo' : ''}`} style={logo ? undefined : { background }}>
        {logo ? <img src={logo.src} alt={logo.alt} /> : fallback}
      </div>
    );
  };
  const cardBrand = (w: typeof cards[number]) => {
    const medium = mediumOf(w);
    if (w.cardNetwork) return w.cardNetwork.toUpperCase();
    return medium === 'credit' ? 'CARD' : medium === 'ewallet' ? 'E-WALLET' : medium === 'cash' ? 'CASH' : 'DEBIT';
  };

  // Dompet default hanya bisa berupa dompet debit (lihat pemilihnya di layar Profil),
  // jadi kapsul ini tidak akan pernah muncul di kartu kredit.
  const isDefault = (id: string) => Boolean(ui.prefs.defaultWalletId) && ui.prefs.defaultWalletId === id;
  // Judulnya menjelaskan akibat dari status ini, karena kata "Default" saja tidak
  // memberi tahu apa yang berubah karenanya.
  const defaultTag = (id: string) => isDefault(id) && (
    <span className="tag-default" title={t('profile.defaultWalletNote')}>{t('wallets.defaultTag')}</span>
  );

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
        <div
          className={`card-track${cards.length === 1 ? ' single' : ''}`}
          ref={trackRef}
          onScroll={onScroll}
        >
          {cards.map((w, index) => (
            <div className="card-slide" key={w.id}>
              <div
                className={`paycard${mediumOf(w) === 'credit' ? ' credit' : ''}${
                  index === active ? '' : index < active ? ' behind before' : ' behind after'
                }`}
                onClick={() => { setActive(index); ui.openItem(w.name, 'wallet', w.id); }}
              >
                <div className="pt">
                  <span className="pt-name">
                    <span className="pb">{w.name}</span>
                    {defaultTag(w.id)}
                  </span>
                  <span className="pt-actions">
                    {/* Edit menempel pada kartunya sendiri, jadi tidak ada lagi tombol
                        "Edit" global yang diam-diam menyasar kartu yang sedang aktif.
                        stopPropagation wajib: klik kartu membuka rincian, bukan form. */}
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
                    <span className="pchip" />
                  </span>
                </div>
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
          hanya dua, tidak mengisi satu baris penuh. */}
      <div className="qa center">
        <button className="qa-btn" onClick={() => { setHidden(h => !h); ui.notify(hidden ? t('wallets.cardShown') : t('wallets.cardHidden')); }}>
          {/* Ikon menggambarkan aksinya, bukan keadaan sekarang — aturan yang sama
              dengan tombol lihat/sembunyikan password di halaman masuk. */}
          <span className="qa-ic">{hidden ? <Eye /> : <EyeOff />}</span>
          <span>{hidden ? t('wallets.show') : t('wallets.hide')}</span>
        </button>
        {/* Lingkaran putus-putus: perlakuan yang sama dengan tombol "+" di deret pintasan
            beranda, supaya "tambah sesuatu" terlihat sama di seluruh aplikasi. */}
        <button className="qa-btn" onClick={() => ui.openCreate('wallet')}>
          <span className="qa-ic dashed"><Plus /></span><span>{t('common.add')}</span>
        </button>
      </div>

      {current && currentReserved > 0 && (
        <div className="wbreak">
          <div><div className="k">{t('wallets.afterSavings')}</div><div className="v">{money.fmt(current.balance - currentReserved)}</div></div>
          <div><div className="k">{t('wallets.reserved')}</div><div className="v lock">{money.fmt(currentReserved)}</div></div>
        </div>
      )}

      <div className="sec"><span className="t">{t('wallets.liquidityDebit')}</span><button className="addg" onClick={() => ui.openCreate('wallet')}><Plus />{t('common.add')}</button></div>
      {debit.length === 0 && (
        <div className="saving-empty">{t('wallets.debitEmpty')}</div>
      )}
      {debit.map(w => {
        const reserved = reservedIn(w.id);
        const medium = mediumOf(w);
        return (
          <div className="row" key={w.id} onClick={() => ui.openItem(w.name, 'wallet', w.id)}>
            {walletListIcon(w, initials(w.name), color[w.name] || '#444')}
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
              <div><div className="pt">{s.emoji ? s.emoji + ' ' : ''}{s.name}</div><div className="pmeta">{t('wallets.savingIn')} {walletName(s.walletId)}</div></div>
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
          {walletListIcon(w, 'CC', color[w.name] || '#2F4858')}
          <div className="mid"><div className="t1">{w.name}</div><div className="t2">•••• {w.last4}</div></div>
          <div className="r"><div className="val out">−{money.fmt(w.balance)}</div><div className="subt">{t('wallets.limit')} {money.fmtCompact(w.creditLimit!)}</div></div>
        </div>
      ))}
    </>
  );
}
