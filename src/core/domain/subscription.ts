import { Subscription, BillingCycle } from './types';

const addCycle = (d: Date, cycle: BillingCycle, customDays?: number): Date => {
  const n = new Date(d);
  if (cycle === 'weekly') n.setDate(n.getDate() + 7);
  else if (cycle === 'monthly') n.setMonth(n.getMonth() + 1);
  else if (cycle === 'quarterly') n.setMonth(n.getMonth() + 3);
  else if (cycle === 'yearly') n.setFullYear(n.getFullYear() + 1);
  else n.setDate(n.getDate() + (customDays ?? 30));
  return n;
};
const daysBetween = (a: Date, b: Date) => Math.ceil((+b - +a) / 86_400_000);

export function nextBillingDate(s: Subscription): Date { return addCycle(new Date(s.nextBillingDate), s.cycle, s.customIntervalDays); }
export function isReminderDue(s: Subscription, today: Date = new Date()): boolean {
  if (s.status !== 'active') return false;
  const d = daysBetween(today, new Date(s.nextBillingDate));
  return d >= 0 && d <= s.reminderDaysBefore;
}
export function isEndingSoon(s: Subscription, windowDays = 14, today: Date = new Date()): boolean {
  if (!s.endDate) return false;
  const d = daysBetween(today, new Date(s.endDate));
  return d >= 0 && d <= windowDays;
}
export function daysUntilBilling(s: Subscription, today: Date = new Date()): number { return daysBetween(today, new Date(s.nextBillingDate)); }
export function daysUntilEnd(s: Subscription, today: Date = new Date()): number | null { return s.endDate ? daysBetween(today, new Date(s.endDate)) : null; }

export function monthlyCost(s: Subscription): number {
  if (s.cycle === 'weekly') return s.amount * 52 / 12;
  if (s.cycle === 'monthly') return s.amount;
  if (s.cycle === 'quarterly') return s.amount / 3;
  if (s.cycle === 'yearly') return s.amount / 12;
  return s.amount * 30 / (s.customIntervalDays ?? 30);
}
export function totalMonthlyBurden(subs: Subscription[]): number {
  return subs.filter(s => s.status === 'active').reduce((sum, s) => sum + monthlyCost(s), 0);
}
