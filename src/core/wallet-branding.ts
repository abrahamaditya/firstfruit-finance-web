import type { Wallet } from './domain/types';

type BrandableWallet = Pick<Wallet, 'name' | 'bank' | 'medium' | 'cardNetwork'>;

/** Logo aset yang konsisten untuk ringkasan beranda dan sumber dana transaksi. */
export function walletBrandLogo(wallet: BrandableWallet): string | undefined {
  if (wallet.medium === 'cash') return '/brand/dompet-logo.png';
  if (wallet.cardNetwork === 'visa') return '/brand/visa-logo.png';
  if (wallet.cardNetwork === 'mastercard') return '/brand/martercard-logo.png';
  if (wallet.cardNetwork === 'gpn') return '/brand/gpn-logo.png';

  const identity = `${wallet.name} ${wallet.bank ?? ''}`.toLowerCase();
  const known = [
    { names: ['blu'], src: '/brand/blu-logo.png' },
    { names: ['gopay'], src: '/brand/gopay-logo.png' },
    { names: ['ovo'], src: '/brand/ovo-logo.png' },
    { names: ['dana'], src: '/brand/dana-logo.png' },
    { names: ['shopeepay', 'shopee pay'], src: '/brand/shopeepay-logo.png' },
    { names: ['flazz'], src: '/brand/flazz-logo.png' },
    { names: ['livin', 'mandiri'], src: '/brand/livin-mandiri-logo.png' },
  ];
  return known.find(brand => brand.names.some(name => identity.includes(name)))?.src;
}

export const walletBrandInitial = (wallet: Pick<Wallet, 'name'>) =>
  wallet.name.trim().slice(0, 3).toUpperCase();
