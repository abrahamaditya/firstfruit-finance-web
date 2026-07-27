import { Wallet, Transaction, Budget, BudgetPeriod, Subscription, Receivable, Plan, Saving, Reminder, Beneficiary } from '../core/domain/types';

const iso = (daysFromNow: number) => { const d = new Date(); d.setDate(d.getDate() + daysFromNow); return d.toISOString(); };

export const seedWallets: Wallet[] = [
  { id: 'w_bca', name: 'BCA', kind: 'debit', medium: 'bank', bank: 'BCA', last4: '4821', balance: 12_450_000 },
  { id: 'w_blu', name: 'blu by BCA', kind: 'debit', medium: 'bank', bank: 'BCA Digital', last4: '7330', balance: 4_820_000 },
  { id: 'w_gopay', name: 'GoPay', kind: 'debit', medium: 'ewallet', bank: 'Gojek', phone: '0812-3344-5566', balance: 385_000 },
  { id: 'w_ovo', name: 'OVO', kind: 'debit', medium: 'ewallet', bank: 'OVO', phone: '0812-3344-5566', balance: 142_000 },
  { id: 'w_cash', name: 'Tunai', kind: 'debit', medium: 'cash', balance: 250_000 },
  { id: 'w_cc', name: 'Kartu Kredit BCA', kind: 'credit', medium: 'credit', bank: 'BCA', last4: '6034', balance: 2_100_000, creditLimit: 15_000_000 },
];
export const seedTransactions: Transaction[] = [
  { id: 't1', type: 'expense', nature: 'unexpected', amount: 28_000, walletId: 'w_bca', labels: ['Kopi & Kafe'], merchant: 'Kafe', budgetId: 'b1', note: 'Kopi Tuku', date: iso(0) },
  { id: 't2', type: 'transfer', nature: 'fixed', amount: 2_000_000, walletId: 'w_bca', toWalletId: 'w_blu', labels: [], note: 'Transfer ke blu', date: iso(0) },
  { id: 't3', type: 'expense', nature: 'unexpected', amount: 67_500, walletId: 'w_gopay', labels: ['Belanja Dapur'], merchant: 'Indomaret', budgetId: 'b1', note: 'Belanja mingguan', date: iso(0) },
  { id: 't4', type: 'income', nature: 'fixed', amount: 9_500_000, walletId: 'w_bca', labels: ['Gaji Pokok'], note: 'Gaji Februari', date: iso(-1) },
  { id: 't5', type: 'expense', nature: 'fixed', amount: 500_000, walletId: 'w_bca', labels: ['Persembahan Mingguan'], budgetId: 'b2', recipient: 'Gereja', note: 'Persembahan', date: iso(-1) },
  { id: 't6', type: 'expense', nature: 'fixed', amount: 186_000, walletId: 'w_cc', labels: ['Streaming Film'], subscriptionId: 's_netflix', note: 'Netflix Premium', date: iso(-1) },
  { id: 't7', type: 'expense', nature: 'unexpected', amount: 150_000, walletId: 'w_bca', labels: ['Hadiah & Kado'], merchant: 'Shopee', beneficiary: 'gift', recipient: 'Sarah', note: 'Kado ultah Sarah', date: iso(-2) },
];
export const seedBudgets: Budget[] = [
  { id: 'b1', category: 'Makanan & Minuman', allocated: 1_500_000, spent: 1_080_000 },
  { id: 'b2', category: 'Rohani', allocated: 1_000_000, spent: 500_000 },
  { id: 'b3', category: 'Transportasi Umum', allocated: 500_000, spent: 155_000 },
  { id: 'b4', category: 'Kebutuhan Harian', allocated: 800_000, spent: 880_000 },
];
export const seedPeriods: BudgetPeriod[] = [
  { id: 'p_feb', alias: 'Periode Februari', start: iso(-14), end: iso(16), closed: false },
];
export const seedSubscriptions: Subscription[] = [
  { id: 's_netflix', name: 'Netflix Premium', amount: 186_000, walletId: 'w_cc', category: 'Streaming Film', cycle: 'monthly', startDate: iso(-60), nextBillingDate: iso(3), reminderDaysBefore: 3, status: 'active' },
  { id: 's_spotify', name: 'Spotify Premium', amount: 54_990, walletId: 'w_gopay', category: 'Streaming Musik', cycle: 'monthly', startDate: iso(-90), nextBillingDate: iso(9), reminderDaysBefore: 3, status: 'active' },
  { id: 's_gym', name: 'Membership Gym', amount: 350_000, walletId: 'w_bca', category: 'Gym & Membership', cycle: 'monthly', startDate: iso(-120), endDate: iso(12), nextBillingDate: iso(12), reminderDaysBefore: 3, status: 'active' },
  { id: 's_icloud', name: 'iCloud+ 200GB', amount: 15_000, walletId: 'w_cc', category: 'Cloud Storage', cycle: 'monthly', startDate: iso(-200), nextBillingDate: iso(12), reminderDaysBefore: 3, status: 'active' },
  { id: 's_domain', name: 'Domain & Hosting', amount: 480_000, walletId: 'w_bca', category: 'Hosting & Server', cycle: 'yearly', startDate: iso(-300), nextBillingDate: iso(15), reminderDaysBefore: 7, status: 'active' },
];
export const seedReceivables: Receivable[] = [
  { id: 'r1', person: 'Budi', amount: 80_000, source: 'Split bill', date: iso(0), settled: false },
  { id: 'r2', person: 'Citra', amount: 80_000, source: 'Split bill', date: iso(0), settled: false },
  { id: 'r3', person: 'Keluarga', amount: 260_000, source: 'Pinjaman', date: iso(-6), settled: false },
  { id: 'r4', person: 'Rian', amount: 150_000, source: 'Patungan', date: iso(-13), settled: true },
];
export const seedPlans: Plan[] = [
  { id: 'pl1', title: 'Furniture Ruang Tamu', target: 12_000_000, saved: 4_800_000, targetDate: '2026-12-01', status: 'active' },
  { id: 'pl2', title: 'DP Mobil', target: 50_000_000, saved: 3_000_000, targetDate: '2027-06-01', status: 'draft' },
  { id: 'pl3', title: 'Dana Darurat 6 bulan', target: 30_000_000, saved: 21_000_000, status: 'active' },
];
export const seedBeneficiaries: Beneficiary[] = [
  { id: 'bf_gereja', name: 'Gereja', kind: 'church', note: 'Perpuluhan & persembahan' },
  { id: 'bf_keluarga', name: 'Keluarga', kind: 'family', note: 'Orang tua & saudara' },
  { id: 'bf_jeje', name: 'Jeje', kind: 'person', note: 'Adik — biaya kuliah' },
  { id: 'bf_budi', name: 'Budi', kind: 'person' },
  { id: 'bf_citra', name: 'Citra', kind: 'person' },
  { id: 'bf_kantor', name: 'PT Sejahtera', kind: 'business', note: 'Tempat kerja' },
];
export const seedReminders: Reminder[] = [
  { id: 'rm1', title: 'Bayar SPP Jeje', date: iso(2), amount: 1_250_000, done: false },
  { id: 'rm2', title: 'Cek tagihan listrik', date: iso(5), note: 'Meteran dibaca tanggal 5', done: false },
  { id: 'rm3', title: 'Kirim invoice klien', date: iso(-1), done: true },
];
export const seedSavings: Saving[] = [
  { id: 'sv_jeje', name: 'Uang Kuliah Jeje', walletId: 'w_blu', balance: 2_000_000, target: 6_000_000, targetDate: '2026-12-01', emoji: '🎓' },
  { id: 'sv_darurat', name: 'Dana Darurat', walletId: 'w_bca', balance: 5_000_000, emoji: '🛡️' },
];
