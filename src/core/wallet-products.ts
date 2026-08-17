import type { WalletMedium } from './domain/types';

export type WalletCategory = Exclude<WalletMedium, 'cash'> | 'digital';

/**
 * Katalog produk dompet yang boleh dipilih pengguna.
 *
 * `value` disimpan di `Wallet.bank`/`institution_name`, sedangkan `label` menjadi nama
 * tampilan dompet. Dengan begitu nama, logo, warna, dan jenis selalu berasal dari pilihan
 * produk yang sama.
 */
export interface WalletProduct {
  value: string;
  label: string;
  medium: WalletCategory;
  logo?: string;
  color: string;
  theme: string;
}

export const WALLET_PRODUCTS: readonly WalletProduct[] = [
  { value: 'BCA', label: 'Paspor BCA', medium: 'bank', color: '#1a4ea3', theme: 'ocean' },
  { value: 'Bank Mandiri', label: 'Debit Mandiri', medium: 'bank', logo: '/brand/livin-mandiri-logo.png', color: '#f5b400', theme: 'royal' },

  { value: 'blu by BCA', label: 'blu by BCA', medium: 'digital', logo: '/brand/blu-logo.png', color: '#0a8cd4', theme: 'aqua' },

  { value: 'GoPay', label: 'GoPay', medium: 'ewallet', logo: '/brand/gopay-logo.png', color: '#0daee8', theme: 'gopay' },
  { value: 'OVO', label: 'OVO', medium: 'ewallet', logo: '/brand/ovo-logo.png', color: '#4c2a86', theme: 'violet' },
  { value: 'DANA', label: 'DANA', medium: 'ewallet', logo: '/brand/dana-logo.png', color: '#118eea', theme: 'sky' },
  { value: 'ShopeePay', label: 'ShopeePay', medium: 'ewallet', logo: '/brand/shopeepay-logo.png', color: '#ee4d2d', theme: 'sunset' },
  { value: 'Flazz BCA', label: 'Flazz BCA', medium: 'ewallet', logo: '/brand/flazz-logo.png', color: '#1a4ea3', theme: 'ocean' },

  { value: 'BCA', label: 'Kartu kredit BCA', medium: 'credit', color: '#1a4ea3', theme: 'slate' },
  { value: 'Bank Mandiri', label: 'Kartu kredit Mandiri', medium: 'credit', logo: '/brand/livin-mandiri-logo.png', color: '#f5b400', theme: 'slate' },
] as const;

const normalize = (value?: string) => value?.trim().toLocaleLowerCase('id-ID') ?? '';

export const walletProductsFor = (medium?: string) =>
  WALLET_PRODUCTS.filter((product) => product.medium === medium);

export const walletProduct = (medium?: string, institution?: string) => {
  const normalizedInstitution = normalize(institution);
  return WALLET_PRODUCTS.find(
    (product) => product.medium === medium && normalize(product.value) === normalizedInstitution,
  ) ?? WALLET_PRODUCTS.find((product) => normalize(product.value) === normalizedInstitution);
};
