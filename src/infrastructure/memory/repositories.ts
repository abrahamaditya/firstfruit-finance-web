import { Repository, DataRepositories } from '../../core/ports/repositories';
import * as seed from '../seed';

// In-memory repository — lets the app run with sample data, no Firebase required.
class MemoryRepo<T extends { id: string }> implements Repository<T> {
  private items: T[];
  constructor(initial: T[]) { this.items = [...initial]; }
  async list() { return [...this.items]; }
  async get(id: string) { return this.items.find(i => i.id === id) ?? null; }
  async create(item: Omit<T, 'id'>) { const created = { ...item, id: 'id_' + Math.random().toString(36).slice(2, 9) } as T; this.items.push(created); return created; }
  async update(id: string, patch: Partial<T>) { this.items = this.items.map(i => i.id === id ? { ...i, ...patch } : i); return (await this.get(id))!; }
  async remove(id: string) { this.items = this.items.filter(i => i.id !== id); }
}

export function createMemoryRepositories(): DataRepositories {
  const wallets = new MemoryRepo(seed.seedWallets);
  const transactions = new MemoryRepo(seed.seedTransactions);
  const budgets = new MemoryRepo(seed.seedBudgets);
  const periods = new MemoryRepo(seed.seedPeriods);
  const subscriptions = new MemoryRepo(seed.seedSubscriptions);
  const receivables = new MemoryRepo(seed.seedReceivables);
  const plans = new MemoryRepo(seed.seedPlans);
  const savings = new MemoryRepo(seed.seedSavings);
  const reminders = new MemoryRepo(seed.seedReminders);
  return {
    wallets,
    transactions,
    budgets,
    periods,
    subscriptions,
    receivables,
    plans,
    savings,
    reminders,
    commands: {
      async createPeriod(options) {
        const hasOpen = (await periods.list()).some((period) => period.status === 'open');
        const created = await periods.create({
          alias: options.alias,
          start: options.start,
          end: options.end,
          closed: false,
          status: hasOpen ? 'draft' : 'open',
        });
        const selected = new Set(options.budgetIds ?? []);
        const templates = (await budgets.list()).filter((budget) => selected.has(budget.id));
        await Promise.all(templates.map(({ category, allocated }) => budgets.create({
          category,
          allocated,
          spent: 0,
          periodId: created.id,
        })));
        return created.id;
      },
      async closePeriod(periodId, options) {
        const closed = await periods.get(periodId);
        await periods.update(periodId, { closed: true, status: 'closed' });
        if (!options.createNext) return null;
        const start = closed ? new Date(closed.end) : new Date();
        start.setDate(start.getDate() + 1);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        end.setDate(end.getDate() - 1);
        const next = await periods.create({
          alias: options.nextAlias || 'Periode berikutnya',
          start: start.toISOString(),
          end: end.toISOString(),
          closed: false,
          status: 'open',
        });
        const selected = options.budgetIds ? new Set(options.budgetIds) : null;
        const sourceBudgets = (await budgets.list()).filter((budget) =>
          budget.periodId === periodId && (!selected || selected.has(budget.id)),
        );
        await Promise.all(sourceBudgets.map(({ category, allocated }) => budgets.create({
          category,
          allocated,
          spent: 0,
          periodId: next.id,
        })));
        return next.id;
      },
      async adjustSaving(savingId, amount, action) {
        const goal = await savings.get(savingId);
        if (!goal) throw new Error('Tabungan tidak ditemukan');
        await savings.update(savingId, {
          balance: action === 'reserve' ? goal.balance + amount : goal.balance - amount,
        });
      },
      async settleReceivable(receivableId, options) {
        const item = await receivables.get(receivableId);
        if (!item) throw new Error('Piutang tidak ditemukan');
        await receivables.update(receivableId, {
          settled: true,
          paid: item.amount,
          settledAt: options?.occurredAt ?? new Date().toISOString(),
        });
      },
      async markReminderDone(reminderId, done) {
        await reminders.update(reminderId, { done });
      },
      async archiveWallet(walletId) {
        await wallets.remove(walletId);
      },
      async finalizeSplitBill() {
        return 'split_' + Math.random().toString(36).slice(2, 9);
      },
    },
  };
}
