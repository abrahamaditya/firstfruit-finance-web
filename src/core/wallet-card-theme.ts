import type { Wallet } from './domain/types';
import { walletProduct } from './wallet-products';

type ThemableWallet = Pick<Wallet, 'id' | 'name' | 'kind' | 'medium' | 'bank'>;

export interface WalletCardTheme {
  /** Nilai data-theme kartu — menentukan gradasi, warna tinta, dan rona bayangannya. */
  theme: string;
  /** Nilai data-pattern kartu — menentukan hiasan latar (lihat globals.css). */
  pattern: string;
}

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
  // Semua produk BCA memakai komposisi kartu generik yang sama, tetapi warna kartu
  // mengikuti varian fisiknya agar Paspor Blue/Gold/Platinum tidak terasa identik.
  if (wallet.bank === 'BCA') {
    if (wallet.kind === 'credit') return { theme: 'bca-credit', pattern };
    const name = wallet.name.toLocaleLowerCase('id-ID');
    if (name.includes('platinum')) return { theme: 'bca-platinum', pattern };
    if (name.includes('gold')) return { theme: 'bca-gold', pattern };
    return { theme: 'bca-blue', pattern };
  }
  if (wallet.kind === 'credit') {
    return { theme: CREDIT_THEMES[seed % CREDIT_THEMES.length], pattern };
  }

  const product = walletProduct(medium, wallet.bank);
  return { theme: product?.theme ?? FALLBACK_THEMES[seed % FALLBACK_THEMES.length], pattern };
}
