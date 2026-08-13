import type { Transaction } from './types';
import { categoryPath } from './categories';

// ===== Analitik laporan =====
// Semua fungsi di sini murni: masukan transaksi + rentang, keluaran angka. Layar laporan
// hanya menyusun tampilannya. Pemisahan ini penting karena jumlah irisannya banyak —
// dicampur ke dalam komponen, aturan bisnisnya (mana yang dihitung, mana yang tidak)
// akan tenggelam di antara markup.

const DAY_MS = 86_400_000;

/**
 * Jalur kategori sebuah transaksi, mis. ['Needs', 'Food', 'Belanja Dapur'].
 *
 * `labels` dari repositori Supabase sudah berbentuk jalur lengkap, tapi data lama dan
 * kategori bebas bisa menyimpan satu label saja. Keduanya dinormalkan di sini supaya
 * pohon kategori tidak bercabang palsu hanya karena bentuk datanya berbeda.
 */
export const transactionPath = (transaction: Pick<Transaction, 'labels' | 'type'>): string[] => {
  if (transaction.labels.length > 1) return transaction.labels;
  const label = transaction.labels[0];
  if (!label) return [];
  return categoryPath(label, transaction.type === 'income' ? 'income' : 'expense');
};

export interface CategoryNode {
  name: string;
  total: number;
  count: number;
  children: CategoryNode[];
}

/**
 * Pohon kategori tiga tingkat: kelompok besar › kategori › spesifik. Setiap simpul
 * memikul total seluruh anaknya, jadi induk selalu sama dengan jumlah cabangnya —
 * itulah yang membuat persentase di tiap tingkat bisa dibaca tanpa menghitung ulang.
 */
export function categoryTree(transactions: Transaction[], uncategorized: string): CategoryNode[] {
  const roots: CategoryNode[] = [];
  const index = new Map<string, CategoryNode>();

  transactions.forEach((transaction) => {
    const path = transactionPath(transaction);
    const segments = path.length > 0 ? path : [uncategorized];
    let siblings = roots;
    let key = '';
    segments.forEach((segment) => {
      key = key ? `${key}›${segment}` : segment;
      let node = index.get(key);
      if (!node) {
        node = { name: segment, total: 0, count: 0, children: [] };
        index.set(key, node);
        siblings.push(node);
      }
      node.total += transaction.amount;
      node.count += 1;
      siblings = node.children;
    });
  });

  const sortDeep = (nodes: CategoryNode[]): CategoryNode[] => {
    nodes.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    nodes.forEach((node) => sortDeep(node.children));
    return nodes;
  };
  return sortDeep(roots);
}

/**
 * Kategori yang tetap dihitung sebagai kebiasaan harian walau sudah dianggarkan.
 * Dicocokkan ke segmen mana pun di jalur kategori, jadi berlaku untuk kedua taksonomi
 * (ringkas: Needs › Food, dan lengkap: Kebutuhan Pokok › Makanan & Minuman › Kopi & Kafe).
 */
const HABITUAL_EXCEPTIONS = new Set([
  'makanan & minuman', 'food', 'dining out',
  'bensin', 'servis & sparepart', 'cuci kendaraan',
]);

/**
 * Apakah sebuah pengeluaran mencerminkan kebiasaan harian.
 *
 * Belanja yang sudah dianggarkan dibuang, karena tanggalnya ditentukan tagihan — bukan
 * oleh perilaku. Satu pembayaran sewa yang kebetulan jatuh hari Selasa akan membuat Selasa
 * tampak sebagai hari paling boros sepanjang periode, padahal tidak ada kebiasaan apa pun
 * di sana. Kecualinya adalah belanja yang tetap mengikuti ritme harian walau dianggarkan:
 * makanan & minuman, serta biaya motor (bensin, servis, cuci).
 */
export const isHabitualExpense = (transaction: Pick<Transaction, 'labels' | 'type' | 'budgetId'>) => {
  if (!transaction.budgetId) return true;
  return transactionPath(transaction)
    .some(segment => HABITUAL_EXCEPTIONS.has(segment.trim().toLowerCase()));
};

export interface WeekdayStat {
  /** 0 = Minggu, mengikuti Date#getDay. */
  weekday: number;
  total: number;
  count: number;
  /** Berapa kali hari ini muncul di rentang — pembagi rata-ratanya. */
  occurrences: number;
  average: number;
}

/**
 * Pola belanja per hari dalam seminggu.
 *
 * Rata-rata dibagi dengan **jumlah kemunculan hari itu di rentang**, bukan dengan jumlah
 * transaksi. Rentang 30 hari memuat 4 Senin tapi bisa 5 Sabtu; membagi dengan angka yang
 * sama untuk semua hari akan membuat hari yang kebetulan lebih sering muncul tampak
 * lebih boros padahal tidak.
 */
export function weekdayPattern(transactions: Transaction[], from: Date, to: Date): WeekdayStat[] {
  const stats: WeekdayStat[] = Array.from({ length: 7 }, (_, weekday) => ({
    weekday, total: 0, count: 0, occurrences: 0, average: 0,
  }));

  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(to);
  limit.setHours(0, 0, 0, 0);
  while (cursor <= limit) {
    stats[cursor.getDay()].occurrences += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  transactions.forEach((transaction) => {
    const stat = stats[new Date(transaction.date).getDay()];
    stat.total += transaction.amount;
    stat.count += 1;
  });

  stats.forEach((stat) => {
    stat.average = stat.occurrences > 0 ? Math.round(stat.total / stat.occurrences) : 0;
  });
  return stats;
}

export interface AmountStats {
  /** Nilai tengah — pendamping wajib rata-rata, karena satu belanja besar menarik
   *  rata-rata jauh dari angka yang sebenarnya sering terjadi. */
  median: number;
  smallest: number;
  largest: number;
  average: number;
}

export function amountStats(transactions: Transaction[]): AmountStats {
  if (transactions.length === 0) return { median: 0, smallest: 0, largest: 0, average: 0 };
  const amounts = transactions.map((transaction) => transaction.amount).sort((a, b) => a - b);
  const middle = Math.floor(amounts.length / 2);
  return {
    median: amounts.length % 2 === 0
      ? Math.round((amounts[middle - 1] + amounts[middle]) / 2)
      : amounts[middle],
    smallest: amounts[0],
    largest: amounts[amounts.length - 1],
    average: Math.round(amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length),
  };
}

/** Hari tanpa satu pun pengeluaran — ukuran kebiasaan, bukan ukuran nominal. */
export function noSpendDays(expenses: Transaction[], from: Date, to: Date): number {
  const spent = new Set<string>();
  expenses.forEach((transaction) => {
    const at = new Date(transaction.date);
    spent.add(`${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`);
  });
  let free = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(to);
  limit.setHours(0, 0, 0, 0);
  while (cursor <= limit) {
    if (!spent.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) free += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return free;
}

/** Rentetan hari beruntun tanpa pengeluaran yang terpanjang di dalam rentang. */
export function longestNoSpendStreak(expenses: Transaction[], from: Date, to: Date): number {
  const spent = new Set<string>();
  expenses.forEach((transaction) => {
    const at = new Date(transaction.date);
    spent.add(`${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`);
  });
  let best = 0;
  let current = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(to);
  limit.setHours(0, 0, 0, 0);
  while (cursor <= limit) {
    if (spent.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
      current = 0;
    } else {
      current += 1;
      if (current > best) best = current;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return best;
}

export interface GroupSlice {
  key: string;
  total: number;
  count: number;
}

/** Pengelompokan umum untuk irisan datar: dompet, tempat, jenis biaya. */
export function groupBy(
  transactions: Transaction[],
  keyOf: (transaction: Transaction) => string | undefined,
): GroupSlice[] {
  const totals = new Map<string, GroupSlice>();
  transactions.forEach((transaction) => {
    const key = keyOf(transaction);
    if (!key) return;
    const slice = totals.get(key) ?? { key, total: 0, count: 0 };
    slice.total += transaction.amount;
    slice.count += 1;
    totals.set(key, slice);
  });
  return [...totals.values()].sort((a, b) => b.total - a.total);
}

/**
 * Perkiraan total belanja sampai akhir periode dengan laju yang sedang berjalan.
 * Hanya masuk akal untuk periode yang belum lewat; pemanggil yang memutuskan.
 */
export function projectedSpending(spentSoFar: number, daysElapsed: number, daysTotal: number) {
  if (daysElapsed <= 0) return spentSoFar;
  return Math.round((spentSoFar / daysElapsed) * daysTotal);
}

/** Berapa hari uang bertahan pada laju belanja sekarang. */
export function runwayDays(liquidity: number, dailyBurn: number) {
  if (dailyBurn <= 0 || liquidity <= 0) return null;
  return Math.floor(liquidity / dailyBurn);
}

export const daysBetween = (from: Date, to: Date) =>
  Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1);
