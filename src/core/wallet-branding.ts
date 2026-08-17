import type { Wallet } from './domain/types';
import { walletProduct } from './wallet-products';

type BrandableWallet = Pick<Wallet, 'name' | 'bank' | 'medium' | 'cardNetwork'>;

/** Logo aset yang konsisten untuk ringkasan beranda dan sumber dana transaksi. */
export function walletBrandLogo(wallet: BrandableWallet): string | undefined {
  if (wallet.medium === 'cash') return '/brand/dompet-logo.png';
  if (wallet.bank === 'BCA') {
    if (wallet.medium === 'credit') return '/brand/bca-kredit.png';
    const name = wallet.name.toLocaleLowerCase('id-ID');
    if (name.includes('platinum')) return '/brand/bca-platinum-debit.png';
    if (name.includes('gold')) return '/brand/bca-gold-debit.png';
    return '/brand/bca-blue-debit.png';
  }
  return walletProduct(wallet.medium, wallet.bank)?.logo;
}

/** Logo jaringan selalu dirender sebagai identitas pendamping produk dompet. */
export function walletNetworkLogo(wallet: Pick<Wallet, 'cardNetwork'>): string | undefined {
  if (wallet.cardNetwork === 'visa') return '/brand/visa-logo-transparent.png';
  if (wallet.cardNetwork === 'mastercard') return '/brand/mastercard-logo-transparent.png';
  if (wallet.cardNetwork === 'gpn') return '/brand/gpn-logo-transparent.png';
}

/** Inisial fallback juga berasal dari produk, bukan nama custom. */
export const walletProductInitial = (wallet: BrandableWallet) => {
  const identity = (wallet.bank || wallet.name).trim();
  const words = identity.split(/\s+/);
  return (words.length === 1 ? identity : words.map((part) => part[0]).join(''))
    .slice(0, 3)
    .toUpperCase();
};
