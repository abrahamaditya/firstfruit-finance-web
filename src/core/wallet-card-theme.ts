import type { Wallet } from './domain/types';

type ThemableWallet = Pick<Wallet, 'id' | 'name' | 'kind' | 'medium' | 'bank'>;

export interface WalletCardTheme {
  /** Nilai data-theme kartu — menentukan gradasi, warna tinta, dan rona bayangannya. */
  theme: string;
  /** Nilai data-pattern kartu — menentukan hiasan latar (lihat globals.css). */
  pattern: string;
}

// Merek yang dikenal memakai warnanya sendiri: kartu yang meniru warna aslinya jauh lebih
// cepat dikenali daripada warna acak, dan pengguna sudah hafal biru BCA atau ungu OVO.
const BRAND_THEMES: Array<{ names: string[]; theme: string }> = [
  { names: ['blu'], theme: 'sky' },
  { names: ['bca'], theme: 'ocean' },
  { names: ['gopay'], theme: 'emerald' },
  { names: ['ovo'], theme: 'violet' },
  { names: ['dana'], theme: 'sky' },
  { names: ['shopeepay', 'shopee pay'], theme: 'sunset' },
  { names: ['livin', 'mandiri'], theme: 'royal' },
  { names: ['bni'], theme: 'sunset' },
  { names: ['bri'], theme: 'ocean' },
  { names: ['bsi'], theme: 'teal' },
  { names: ['jago'], theme: 'sunset' },
  { names: ['seabank'], theme: 'sky' },
  { names: ['jenius', 'btpn'], theme: 'teal' },
  { names: ['permata'], theme: 'emerald' },
  { names: ['cimb', 'niaga'], theme: 'plum' },
  { names: ['danamon'], theme: 'ocean' },
  { names: ['flazz'], theme: 'ocean' },
  { names: ['linkaja', 'link aja'], theme: 'sunset' },
];

// Dompet tanpa merek yang dikenal tetap harus berbeda satu sama lain, jadi diambil
// bergilir dari daftar ini lewat sidik nama/id-nya.
const FALLBACK_THEMES = ['ocean', 'violet', 'sunset', 'teal', 'plum', 'amber', 'sky', 'emerald'];
// Kartu kredit selalu bernuansa gelap: ia utang, bukan saldo, dan perbedaan gelap-terang
// itu yang membuat keduanya tidak pernah tertukar saat digeser cepat di carousel.
const CREDIT_THEMES = ['slate', 'graphite', 'wine'];
const PATTERNS = ['orb', 'arcs', 'sheen', 'dots'];

/** Sidik stabil dari string — kartu yang sama harus selalu tampil sama. */
const fingerprint = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export function walletCardTheme(wallet: ThemableWallet): WalletCardTheme {
  const medium = wallet.medium ?? (wallet.kind === 'credit' ? 'credit' : 'bank');
  const seed = fingerprint(wallet.id || wallet.name);
  // Corak diturunkan dari bagian sidik yang berbeda dengan warnanya, supaya dua kartu
  // berwarna sama tidak otomatis bercorak sama juga.
  const pattern = PATTERNS[Math.floor(seed / 13) % PATTERNS.length];

  // Tunai memegang warna merek aplikasi. Ia satu-satunya dompet yang tidak mewakili
  // lembaga mana pun, jadi tidak ada warna "aslinya" yang bisa ditiru.
  if (medium === 'cash') return { theme: 'mint', pattern };
  if (wallet.kind === 'credit') {
    return { theme: CREDIT_THEMES[seed % CREDIT_THEMES.length], pattern };
  }

  const identity = `${wallet.name} ${wallet.bank ?? ''}`.toLowerCase();
  const brand = BRAND_THEMES.find((entry) => entry.names.some((name) => identity.includes(name)));
  return { theme: brand?.theme ?? FALLBACK_THEMES[seed % FALLBACK_THEMES.length], pattern };
}
