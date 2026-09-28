import assert from 'node:assert/strict';
import test from 'node:test';
import { forecastBudgetRealization, periodPatterns } from '../src/core/domain/period-patterns.ts';

const period = (id, start, end, status = 'closed') => ({
  id, alias: id, start: `${start}T12:00:00`, end: `${end}T12:00:00`,
  status, closed: status === 'closed',
});
const budget = (id, periodId, spent, allocated = spent) => ({
  id, periodId, category: 'Makanan', spent, allocated,
});
const expense = (id, date, budgetId, amount, extra = {}) => ({
  id, date: `${date}T12:00:00`, budgetId, amount,
  type: 'expense', nature: 'fixed', walletId: 'wallet', labels: ['Kebutuhan'], ...extra,
});

test('biaya yang biasa terjadi di awal tidak diekstrapolasi setiap hari', () => {
  const august = period('Agustus', '2026-08-01', '2026-08-30');
  const september = period('September', '2026-09-01', '2026-09-30', 'open');
  const result = forecastBudgetRealization(
    september, new Date('2026-09-05T12:00:00'),
    [budget('sep', september.id, 300_000)], [august, september],
    [budget('aug', august.id, 300_000)],
    [expense('augTx', '2026-08-02', 'aug', 300_000), expense('sepTx', '2026-09-02', 'sep', 300_000)],
  );
  assert.equal(result.total, 300_000);
  assert.equal(result.historicalPeriods, 1);
});

test('pembayaran yang biasanya terjadi belakangan masih masuk proyeksi', () => {
  const august = period('Agustus', '2026-08-01', '2026-08-30');
  const september = period('September', '2026-09-01', '2026-09-30', 'open');
  const result = forecastBudgetRealization(
    september, new Date('2026-09-10T12:00:00'),
    [budget('sep', september.id, 100_000, 200_000)], [august, september],
    [budget('aug', august.id, 200_000)], [
      expense('aug1', '2026-08-05', 'aug', 100_000),
      expense('aug2', '2026-08-20', 'aug', 100_000),
      expense('sep1', '2026-09-05', 'sep', 100_000),
    ],
  );
  assert.equal(result.total, 200_000);
});

test('tagihan awal bulan yang terlambat tetap diantisipasi', () => {
  const august = period('Agustus', '2026-08-01', '2026-08-30');
  const september = period('September', '2026-09-01', '2026-09-30', 'open');
  const result = forecastBudgetRealization(
    september, new Date('2026-09-05T12:00:00'),
    [budget('sep', september.id, 0, 300_000)], [august, september],
    [budget('aug', august.id, 300_000)],
    [expense('augTx', '2026-08-02', 'aug', 300_000)],
  );
  assert.equal(result.total, 300_000);
});

test('tanpa riwayat, satu pembelian besar tidak dianggap belanja harian', () => {
  const september = period('September', '2026-09-01', '2026-09-30', 'open');
  const result = forecastBudgetRealization(
    september, new Date('2026-09-05T12:00:00'),
    [budget('sep', september.id, 500_000)], [september], [],
    [expense('sepTx', '2026-09-02', 'sep', 500_000)],
  );
  assert.equal(result.total, 500_000);
  assert.equal(result.fallbackCategories, 1);
});

test('pola antarperiode memakai arus kas riil dan mengabaikan periode aktif', () => {
  const august = period('Agustus', '2026-08-01', '2026-08-30');
  const september = period('September', '2026-09-01', '2026-09-30', 'open');
  const rows = periodPatterns([september, august], [
    expense('normal', '2026-08-02', 'aug', 100_000, { periodId: august.id }),
    expense('piutang', '2026-08-03', 'aug', 60_000, { periodId: august.id, owedAmount: 40_000 }),
    expense('adjust', '2026-08-04', 'aug', 900_000, { periodId: august.id, adjustment: true }),
    { ...expense('salary', '2026-08-05', undefined, 250_000, { periodId: august.id }), type: 'income' },
    { ...expense('settlement', '2026-08-06', undefined, 70_000, { periodId: august.id }), type: 'income', settlesReceivableId: 'debt' },
    expense('active', '2026-09-02', 'sep', 300_000, { periodId: september.id }),
  ], [budget('aug', august.id, 120_000)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].income, 250_000);
  assert.equal(rows[0].expense, 120_000);
  assert.equal(rows[0].expensePerDay, 4_000);
  assert.equal(rows[0].categories.get('Kebutuhan'), 120_000);
});
