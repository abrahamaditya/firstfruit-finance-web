// ===== Money formatting (IDR) =====
export const formatIDR = (n: number): string => 'Rp ' + Math.round(Math.abs(n)).toLocaleString('id-ID');
export const formatSigned = (n: number): string => (n < 0 ? '−' : n > 0 ? '+' : '') + formatIDR(n);
export const formatCompact = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return 'Rp ' + (n / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
  if (a >= 1_000_000) return 'Rp ' + (n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  return formatIDR(n);
};

// ===== Multi-currency (base tetap IDR) =====
export type CurrencyCode = 'IDR' | 'USD';
/** Konversi jumlah tersimpan (IDR) ke mata uang tampilan. */
export const convertFromIDR = (idr: number, code: CurrencyCode, idrPerUsd: number): number =>
  code === 'USD' ? idr / (idrPerUsd || 1) : idr;

/** Format penuh sesuai mata uang tampilan (nilai disimpan dalam IDR). */
export const formatMoney = (idr: number, code: CurrencyCode, idrPerUsd: number): string => {
  if (code === 'USD') {
    const v = Math.abs(convertFromIDR(idr, 'USD', idrPerUsd));
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return formatIDR(idr);
};

/** Format ringkas (jt/M atau K/M/B) sesuai mata uang tampilan. */
export const formatMoneyCompact = (idr: number, code: CurrencyCode, idrPerUsd: number): string => {
  if (code === 'USD') {
    const v = convertFromIDR(idr, 'USD', idrPerUsd);
    const a = Math.abs(v);
    if (a >= 1_000_000_000) return '$' + (v / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'B';
    if (a >= 1_000_000) return '$' + (v / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M';
    if (a >= 1_000) return '$' + (v / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';
    return '$' + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return formatCompact(idr);
};
