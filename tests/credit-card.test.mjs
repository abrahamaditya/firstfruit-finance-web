import assert from 'node:assert/strict';
import test from 'node:test';
import {
  creditCardPeriod, creditCardPosition, creditCardPositions, installmentCarryNote, installmentChargesBetween,
  installmentsDueWithinMonth, runningInstallmentCount, sumCreditCards, uncarriedInstallmentCharges,
} from '../src/core/domain/credit-card.ts';
import { installmentDueDate, installmentDuesForPeriod } from '../src/core/domain/installment-schedule.ts';
import { transactionInPeriod } from '../src/core/domain/calculations.ts';

const period = (id, start, end, status = 'open') => ({
  id, alias: id, start: `${start}T00:00:00`, end: `${end}T23:59:59`, closed: status !== 'open', status,
});
const card = (extra = {}) => ({
  id: 'cc', name: 'Kartu', kind: 'credit', balance: 0, creditLimit: 20_000_000, previousPeriodBill: 0, ...extra,
});
const installment = (extra = {}) => ({
  id: 'hp', type: 'expense', nature: 'fixed', amount: 500_000, walletId: 'cc', labels: ['Elektronik'],
  installmentTenorMonths: 6, installmentPaidMonths: 0, installmentInitialPaidMonths: 0,
  date: '2026-10-10T10:00:00', note: 'HP', ...extra,
});
const payment = (amount, extra = {}) => ({
  id: `pay-${amount}`, type: 'transfer', nature: 'fixed', amount, walletId: 'bca', toWalletId: 'cc',
  labels: [], date: '2026-11-05T10:00:00', ...extra,
});
const october = period('Oktober', '2026-10-01', '2026-10-31');
const november = period('November', '2026-11-01', '2026-11-30');

test('angsuran pertama yang belum lunas jatuh pada tanggal transaksi', () => {
  const ongoing = { date: '2026-10-10T10:00:00', installmentInitialPaidMonths: 3 };
  assert.equal(installmentDueDate(ongoing, 4), '2026-10-10');
  assert.equal(installmentDueDate(ongoing, 5), '2026-11-10');
  assert.equal(installmentDueDate({ date: '2026-01-31T10:00:00' }, 2), '2026-02-28');
});

test('cicilan baru: angsuran pertama ditagih periode ini, sisanya belum ditagih', () => {
  const tx = installment();
  const position = creditCardPosition(card({ previousPeriodBill: 1_000_000 }), [tx], [tx], october);
  assert.equal(position.previousDue, 1_000_000);
  assert.equal(position.spending, 0);
  assert.equal(position.installmentDue, 500_000);
  assert.equal(position.bill, 1_500_000);
  assert.equal(position.installmentUnbilled, 2_500_000);
  assert.equal(position.debt, 4_000_000);
  assert.equal(position.available, 16_000_000);
});

test('bulan berikutnya: angsuran ke-2 menjadi tagihan, angsuran pertama ada di tagihan lalu', () => {
  const tx = installment();
  const unpaid = creditCardPosition(card({ previousPeriodBill: 500_000 }), [], [tx], november);
  assert.equal(unpaid.installmentDue, 500_000);
  assert.equal(unpaid.bill, 1_000_000);
  assert.equal(unpaid.debt, 3_000_000);

  const paid = creditCardPosition(
    card({ previousPeriodBill: 500_000 }), [payment(500_000)], [{ ...tx, installmentPaidMonths: 1 }], november,
  );
  assert.equal(paid.previousDue, 0);
  assert.equal(paid.bill, 500_000);
  assert.equal(paid.debt, 2_500_000);
});

test('alokasi ke angsuran yang belum ditagih tidak mengurangi utang dua kali', () => {
  // Tagihan lalu 1,5 jt (termasuk angsuran pertama). Bayar 1 jt, dialokasikan ke 2 angsuran.
  const tx = { ...installment(), installmentPaidMonths: 2 };
  const position = creditCardPosition(card({ previousPeriodBill: 1_500_000 }), [payment(1_000_000)], [tx], november);
  assert.equal(position.previousDue, 500_000);
  assert.equal(position.installmentDue, 500_000);
  assert.equal(position.bill, 1_000_000);
  assert.equal(position.debt, 3_000_000);

  // Bayar di muka dan alokasikan ke semua angsuran: utang tetap mengikuti uangnya.
  const ahead = { ...installment(), installmentPaidMonths: 6 };
  const october3m = creditCardPosition(
    card({ previousPeriodBill: 3_000_000 }), [ahead, payment(3_000_000, { date: '2026-10-12T10:00:00' })], [ahead], october,
  );
  assert.equal(october3m.debt, 3_000_000);
  assert.equal(october3m.available, 17_000_000);
});

test('angsuran yang dibawa saat periode berganti tidak termasuk angsuran pertama', () => {
  const tx = installment();
  assert.equal(installmentChargesBetween([tx], 'cc', '2026-10-01', '2026-10-31'), 0);
  assert.equal(installmentChargesBetween([tx], 'cc', '2026-11-01', '2026-11-30'), 500_000);
  // Alokasi pembayaran tidak mengubah apa yang ditagihkan bank.
  assert.equal(installmentChargesBetween([{ ...tx, installmentPaidMonths: 6 }], 'cc', '2026-11-01', '2026-11-30'), 500_000);
});

test('cicilan yang seluruh angsurannya sudah lewat tidak lagi menambah tagihan atau utang', () => {
  const tx = installment({ date: '2026-04-10T10:00:00' });
  const position = creditCardPosition(card(), [], [tx], november);
  assert.equal(position.installmentDue, 0);
  assert.equal(position.installmentUnbilled, 0);
  assert.equal(position.debt, 0);
  assert.equal(runningInstallmentCount([tx], '2026-11-30'), 0);
  assert.equal(runningInstallmentCount([installment()], '2026-11-30'), 1);
});

test('angsuran per bulan dihitung dari jadwal, tanpa bergantung pada alokasi', () => {
  const running = installment({ installmentPaidMonths: 0 });
  const finished = installment({ id: 'old', date: '2026-01-10T10:00:00' });
  assert.equal(installmentsDueWithinMonth([running, finished], new Date('2026-11-01T09:00:00')), 500_000);
});

test('tanpa periode berjalan, posisi kartu memakai periode terakhir yang ditutup', () => {
  const closedOctober = { ...october, status: 'closed', closed: true };
  const september = period('September', '2026-09-01', '2026-09-30', 'closed');
  assert.equal(creditCardPeriod([september, closedOctober]), closedOctober);
  assert.equal(creditCardPeriod([september, closedOctober], november), november);
});

test('angsuran periode tertutup yang belum dibawa terdeteksi sampai penandanya ada', () => {
  const tx = installment({ date: '2026-08-10T10:00:00' });
  const august = period('Agustus', '2026-08-01', '2026-08-31', 'closed');
  const september = period('September', '2026-09-01', '2026-09-30', 'closed');
  const periods = [august, september, october];
  const pending = uncarriedInstallmentCharges(card(), [tx], periods, [], october);
  assert.deepEqual(pending.map((entry) => [entry.period.alias, entry.amount]), [['September', 500_000]]);

  const marker = {
    id: 'adj', type: 'income', nature: 'fixed', amount: 500_000, walletId: 'cc', labels: [],
    adjustment: true, note: installmentCarryNote('September'), date: '2026-10-26T10:00:00',
  };
  assert.deepEqual(uncarriedInstallmentCharges(card(), [tx], periods, [marker], october), []);
});

test('beberapa kartu dijumlahkan tanpa saling memengaruhi', () => {
  const other = card({ id: 'cc2', previousPeriodBill: 200_000, creditLimit: 5_000_000 });
  const tx = installment();
  const totals = sumCreditCards(creditCardPositions([card(), other], [tx], [tx], october));
  assert.equal(totals.bill, 700_000);
  assert.equal(totals.debt, 3_200_000);
  assert.equal(totals.limit, 25_000_000);
});

test('jadwal periode memakai tanggal lokal di kedua ujung', () => {
  const tx = installment({ date: '2026-10-01T00:30:00' });
  const dues = installmentDuesForPeriod([tx], october);
  assert.deepEqual(dues.map((due) => due.number), [1]);
});

test('transaksi tanpa periodId ikut periode menurut tanggal lokalnya', () => {
  assert.equal(transactionInPeriod({ date: '2026-10-01T00:10:00' }, october), true);
  assert.equal(transactionInPeriod({ date: '2026-10-31T23:50:00' }, october), true);
  assert.equal(transactionInPeriod({ date: '2026-11-01T00:10:00' }, october), false);
  assert.equal(transactionInPeriod({ periodId: 'other', date: '2026-10-05T10:00:00' }, october), false);
});
