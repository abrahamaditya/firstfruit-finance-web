import React from 'react';
type P = { className?: string };
const S = (d: React.ReactNode, vb = '0 0 24 24') => (p: P) => (
  <svg viewBox={vb} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={p.className}>{d}</svg>
);
export const Plus = S(<path d="M12 5v14M5 12h14" />);
export const Bell = S(<><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>);
export const Chevron = S(<path d="M6 9l6 6 6-6" />);
export const ChevronR = S(<path d="M9 6l6 6-6 6" />);
export const Home = S(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>);
export const WalletIcon = S(<><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h15" /><circle cx="16.5" cy="14.5" r="1.4" /></>);
export const ListIcon = S(<path d="M4 7h16M4 12h16M4 17h10" />);
export const Recur = S(<><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>);
// Panah diagonal arus uang: Up = ↗ (pemasukan), Down = ↙ (pengeluaran).
// Sumbu y SVG tumbuh ke BAWAH, jadi ujung panah "naik" berada di y kecil (7), bukan besar.
// Dua ini sempat tertukar isinya sehingga pemasukan tampil menunjuk ke bawah — kalau
// mengubahnya lagi, cocokkan letak kepala panah dengan titik akhir garisnya.
export const Up = S(<path d="M7 17 17 7M17 7H9M17 7v8" />);
export const Down = S(<path d="M17 7 7 17M7 17h8M7 17V9" />);
export const Transfer = S(<path d="M4 9h13M13 5l4 4-4 4M20 15H7M11 19l-4-4 4-4" />);
export const TransferCard = S(
  <path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 20l-4-4 4-4" />,
);
export const Split = S(<path d="M12 3v18M5 8h14M5 16h14" />);
export const Chart = S(<path d="M3 17l5-5 4 3 6-7" />);
// Anggaran: meter "terpakai dari batas". Silhuetnya (busur terbuka ke bawah) sengaja
// tidak menyerupai Chart (garis tren = laporan) maupun Target (lingkaran = rencana).
export const Gauge = S(<><path d="M4 17a8 8 0 0 1 16 0" /><path d="M12 17l4.5-4.5" /></>);
export const Receivable = S(<><path d="M3 7h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" /></>);
export const Clock = S(<><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></>);
export const Warn = S(<><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>);
export const Info = S(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>);
export const Pencil = S(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>);
export const Copy = S(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>);
export const Trash = S(<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />);
export const Check = S(<path d="M20 6 9 17l-5-5" />);
export const TrendUp = S(<path d="M7 14l5-5 5 5" />);
export const Card = S(<><rect x="2" y="6" width="20" height="12" rx="3" /><path d="M2 10h20" /></>);
export const Search = S(<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>);
export const Calendar = S(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>);
export const Target = S(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v3M21 12h-3" /></>);
export const User = S(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const Settings = S(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>);
export const Close = S(<path d="M6 6l12 12M18 6 6 18" />);
export const Eye = S(<><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>);
// Sengaja memakai ulang geometri Eye persis + satu garis coret, bukan siluet "eye-off"
// yang digambar terpisah: kedua ikon ini bertukar tempat di posisi yang sama, jadi kalau
// bentuk matanya sedikit berbeda pergantiannya terbaca sebagai ikon melompat.
export const EyeOff = S(<><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /><path d="M4 4l16 16" /></>);
export const Lock = S(<><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>);
export const Download = S(<><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>);
export const ArrowUp = S(<path d="M12 20V5M6 11l6-6 6 6" />);
export const ArrowLeft = S(<path d="M19 12H5M11 18l-6-6 6-6" />);
export const Grid = S(<><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></>);
export const Vault = S(<><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="12" cy="12" r="4" /><path d="M12 10v4M10 12h4M18 20v1M6 20v1" /></>);
