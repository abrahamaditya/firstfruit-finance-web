import { Budget, Transaction } from './types';
import { isActualIncome } from './calculations';

// ===== Mesin perencanaan keuangan =====
// Semua fungsi di sini murni: input angka → output angka, tanpa React & tanpa I/O,
// supaya gampang diuji dan dipakai ulang oleh layar mana pun.

export interface PlanningContext {
  available: number;          // uang yang benar-benar bisa dipakai (likuiditas − tabungan terkunci)
  allocatedTotal: number;     // total alokasi anggaran periode berjalan
  spentTotal: number;         // realisasi anggaran
  monthlyIncome: number;      // estimasi pemasukan rutin per bulan
  nextMonthBills: number;     // langganan + pengingat bernominal yang jatuh bulan depan
  expectedReceivables: number;// piutang aktif yang mungkin kembali
  daysLeft: number;           // sisa hari periode berjalan
  totalDays: number;
}

/**
 * Estimasi pemasukan bulanan: pakai pemasukan 31 hari terakhir; kalau bulan ini
 * kebetulan belum ada pemasukan, mundur ke rata-rata 90 hari.
 */
export function estimateMonthlyIncome(transactions: Transaction[], today: Date = new Date()): number {
  const sumSince = (days: number) => {
    const from = new Date(today);
    from.setDate(from.getDate() - days);
    return transactions
      .filter((item) => isActualIncome(item) && new Date(item.date) >= from)
      .reduce((sum, item) => sum + item.amount, 0);
  };
  const lastMonth = sumSince(31);
  if (lastMonth > 0) return Math.round(lastMonth);
  return Math.round(sumSince(90) / 3);
}

/** Sisa anggaran yang belum terpakai (tidak pernah negatif per kategori). */
export const remainingPlanned = (budgets: Budget[]) =>
  budgets.reduce((sum, budget) => sum + Math.max(0, budget.allocated - budget.spent), 0);

/** Kapasitas menabung realistis per bulan: pemasukan − anggaran − tagihan bulan depan. */
export function monthlyCapacity(context: PlanningContext): number {
  return Math.max(0, Math.round(context.monthlyIncome - context.allocatedTotal - context.nextMonthBills));
}

// ===== Metode 1: target dana / beli barang =====
export interface GoalResult {
  needed: number;             // sisa yang harus dikumpulkan
  perMonth: number;           // setoran per bulan yang dipakai
  months: number;             // berapa bulan lagi (0 = sudah cukup)
  finishDate: Date | null;
  feasible: boolean;          // setoran > 0 sehingga target bisa tercapai
  suggestedPerMonth: number;  // kapasitas realistis dari kondisi keuangan sekarang
  strain: number;             // porsi setoran terhadap kapasitas (1 = pas, >1 = memaksa)
}
export function goalPlan(
  target: number, alreadySaved: number, perMonthInput: number, context: PlanningContext,
  today: Date = new Date(),
): GoalResult {
  const suggested = monthlyCapacity(context);
  const perMonth = perMonthInput > 0 ? perMonthInput : suggested;
  const needed = Math.max(0, target - alreadySaved);
  const months = needed === 0 ? 0 : perMonth > 0 ? Math.ceil(needed / perMonth) : Infinity;
  const finishDate = Number.isFinite(months) ? new Date(today.getFullYear(), today.getMonth() + months, today.getDate()) : null;
  return {
    needed,
    perMonth,
    months: Number.isFinite(months) ? months : 0,
    finishDate,
    feasible: needed === 0 || perMonth > 0,
    suggestedPerMonth: suggested,
    strain: suggested > 0 ? perMonth / suggested : perMonth > 0 ? Infinity : 0,
  };
}

/** Kebalikannya: target harus tercapai dalam N bulan → butuh berapa per bulan. */
export function requiredPerMonth(target: number, alreadySaved: number, months: number): number {
  const needed = Math.max(0, target - alreadySaved);
  return months > 0 ? Math.ceil(needed / months) : needed;
}

// ===== Metode 2: sanggup beli bulan depan? =====
export interface AffordabilityResult {
  price: number;
  inflow: number;             // pemasukan + piutang yang diperhitungkan
  outflow: number;            // anggaran + tagihan bulan depan
  surplus: number;            // sisa sebelum beli
  leftover: number;           // sisa setelah beli
  affordable: boolean;
  fromCash: number;           // porsi yang harus diambil dari kas saat ini
}
export function affordability(price: number, context: PlanningContext, includeReceivables: boolean): AffordabilityResult {
  const inflow = context.monthlyIncome + (includeReceivables ? context.expectedReceivables : 0);
  const outflow = context.allocatedTotal + context.nextMonthBills;
  const surplus = inflow - outflow;
  const leftover = surplus - price;
  return {
    price,
    inflow,
    outflow,
    surplus,
    leftover,
    affordable: leftover >= 0,
    fromCash: leftover < 0 ? Math.min(context.available, -leftover) : 0,
  };
}

// ===== Metode 3: dampak belanja dadakan ke satu anggaran =====
export interface WhatIfResult {
  before: { remaining: number; perDay: number };
  after: { remaining: number; perDay: number };
  over: boolean;
  perDayDrop: number;
}
export function whatIfSpend(budget: Budget, extra: number, daysLeft: number): WhatIfResult {
  const days = Math.max(1, daysLeft);
  const before = budget.allocated - budget.spent;
  const after = before - extra;
  return {
    before: { remaining: before, perDay: Math.round(before / days) },
    after: { remaining: after, perDay: Math.round(after / days) },
    over: after < 0,
    perDayDrop: Math.round(before / days) - Math.round(after / days),
  };
}

// ===== Metode 4: mau sisa sekian di akhir periode =====
export interface CutLine { budget: Budget; remaining: number; cut: number; percent: number; after: number; }
export interface SurplusPlanResult {
  projected: number;          // perkiraan sisa kalau tidak diapa-apakan
  needed: number;             // kekurangan yang harus dipotong
  possible: boolean;          // pemotongan masih masuk akal (≤ sisa anggaran)
  overallPercent: number;
  lines: CutLine[];
}
/**
 * Pemotongan dibagi proporsional terhadap sisa tiap anggaran — kategori yang
 * masih longgar dipotong lebih besar, yang sudah mepet dipotong sedikit.
 */
export function surplusPlan(targetLeftover: number, budgets: Budget[], available: number): SurplusPlanResult {
  const remaining = remainingPlanned(budgets);
  const projected = available - remaining;
  const needed = Math.max(0, targetLeftover - projected);
  const ratio = remaining > 0 ? Math.min(1, needed / remaining) : 0;
  const lines = budgets
    .map((budget) => {
      const left = Math.max(0, budget.allocated - budget.spent);
      const cut = Math.round(left * ratio);
      return { budget, remaining: left, cut, percent: left > 0 ? Math.round((cut / left) * 100) : 0, after: left - cut };
    })
    .filter((line) => line.remaining > 0)
    .sort((a, b) => b.cut - a.cut);
  return {
    projected,
    needed,
    possible: needed <= remaining,
    overallPercent: Math.round(ratio * 100),
    lines,
  };
}
