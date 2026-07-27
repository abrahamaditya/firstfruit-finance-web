import { Subscription, BillingCycle } from './types';

// ===== Utilitas kalender =====
// Semua perbandingan tanggal memakai kunci lokal (YYYY-MM-DD) supaya tidak
// bergeser satu hari gara-gara konversi UTC.

export const dayKey = (value: string | Date): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
/** Senin sebagai awal minggu (kebiasaan kalender Indonesia). */
export const startOfWeek = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7));

/** 6 baris × 7 hari, selalu penuh — termasuk ekor bulan sebelum/sesudah. */
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function weekGrid(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

const addCycle = (date: Date, cycle: BillingCycle, customDays?: number): Date => {
  const next = new Date(date);
  if (cycle === 'weekly') next.setDate(next.getDate() + 7);
  else if (cycle === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (cycle === 'quarterly') next.setMonth(next.getMonth() + 3);
  else if (cycle === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else next.setDate(next.getDate() + (customDays ?? 30));
  return next;
};

/**
 * Tanggal tagihan langganan yang jatuh di dalam rentang tampilan kalender.
 * Ditarik mundur dulu dari `nextBillingDate` supaya bulan-bulan lampau juga terisi.
 */
export function billingDatesInRange(sub: Subscription, from: Date, to: Date): Date[] {
  if (sub.status !== 'active') return [];
  const stop = sub.endDate ? new Date(sub.endDate) : null;
  let cursor = new Date(sub.nextBillingDate);
  // Mundur sampai sebelum awal rentang (dibatasi agar tidak jadi loop panjang).
  for (let guard = 0; guard < 240 && cursor > from; guard += 1) {
    const previous = new Date(cursor);
    if (sub.cycle === 'weekly') previous.setDate(previous.getDate() - 7);
    else if (sub.cycle === 'monthly') previous.setMonth(previous.getMonth() - 1);
    else if (sub.cycle === 'quarterly') previous.setMonth(previous.getMonth() - 3);
    else if (sub.cycle === 'yearly') previous.setFullYear(previous.getFullYear() - 1);
    else previous.setDate(previous.getDate() - (sub.customIntervalDays ?? 30));
    if (previous < new Date(sub.startDate)) break;
    cursor = previous;
  }
  const dates: Date[] = [];
  for (let guard = 0; guard < 240 && cursor <= to; guard += 1) {
    if (cursor >= from && (!stop || cursor <= stop)) dates.push(new Date(cursor));
    cursor = addCycle(cursor, sub.cycle, sub.customIntervalDays);
  }
  return dates;
}
