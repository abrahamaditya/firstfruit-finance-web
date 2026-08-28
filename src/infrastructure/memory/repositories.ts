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
  // Setelah periode berganti, saldo kartu akhir menjadi tagihan pembuka periode baru.
  // Operasi ini idempoten dan nilainya tetap dapat diedit setelah auto-fill.
  const carryCreditBills = async () => {
    const creditWallets = (await wallets.list()).filter((wallet) => wallet.kind === 'credit');
    await Promise.all(creditWallets.map((wallet) => wallets.update(wallet.id, {
      previousPeriodBill: Math.max(0, wallet.balance),
    })));
  };
  return {
    wallets,
    transactions,
    budgets,
    periods: {
      list: () => periods.list(),
      get: (id) => periods.get(id),
      create: (item) => periods.create(item),
      update: (id, patch) => periods.update(id, patch),
      async remove(id) {
        const draft = await periods.get(id);
        if (!draft || draft.status !== 'draft') throw new Error('Hanya draft periode yang dapat dihapus');
        const periodBudgets = (await budgets.list()).filter((budget) => budget.periodId === id);
        await Promise.all(periodBudgets.map((budget) => budgets.remove(budget.id)));
        await periods.remove(id);
      },
    },
    subscriptions,
    receivables,
    plans,
    savings,
    reminders,
    commands: {
      async createPeriod(options) {
        const activePeriod = (await periods.list()).find((period) => period.status === 'open');
        if (options.closeCurrent && activePeriod && +new Date(options.start) <= +new Date(activePeriod.end)) {
          throw new Error('Periode baru harus dimulai setelah periode berjalan selesai');
        }
        const created = await periods.create({
          alias: options.alias,
          start: options.start,
          end: options.end,
          closed: false,
          status: activePeriod ? 'draft' : 'open',
        });
        const selected = new Set(options.budgetIds ?? []);
        const templates = (await budgets.list()).filter((budget) => selected.has(budget.id));
        await Promise.all(templates.map(({ category, allocated }) => budgets.create({
          category,
          allocated,
          spent: 0,
          periodId: created.id,
        })));
        if (options.closeCurrent && activePeriod) {
          await periods.update(activePeriod.id, { closed: true, status: 'closed' });
          await periods.update(created.id, { closed: false, status: 'open' });
          await carryCreditBills();
        }
        return created.id;
      },
      async openPeriod(periodId) {
        const target = await periods.get(periodId);
        if (!target || target.status !== 'draft') throw new Error('Periode draft tidak ditemukan');
        const hasOpen = (await periods.list()).some((period) => period.status === 'open');
        if (hasOpen) throw new Error('Tutup periode berjalan sebelum membuka periode ini');
        const overlapsArchive = (await periods.list()).some((period) =>
          period.status === 'closed'
          && +new Date(period.start) <= +new Date(target.end)
          && +new Date(period.end) >= +new Date(target.start),
        );
        if (overlapsArchive) throw new Error('Sesuaikan tanggal draft karena bertumpang tindih dengan periode yang ditutup');
        await periods.update(periodId, { closed: false, status: 'open' });
        await carryCreditBills();
      },
      async closePeriod(periodId, options) {
        const closed = await periods.get(periodId);
        if (options.targetDraftId) {
          const draft = await periods.get(options.targetDraftId);
          if (!closed || !draft || draft.status !== 'draft' || +new Date(draft.start) <= +new Date(closed.end)) {
            throw new Error('Periode draft berikutnya tidak valid');
          }
          await periods.update(periodId, { closed: true, status: 'closed' });
          await periods.update(draft.id, { closed: false, status: 'open' });
          await carryCreditBills();
          const selected = new Set(options.budgetIds ?? []);
          const sourceBudgets = (await budgets.list()).filter((budget) =>
            budget.periodId === periodId && selected.has(budget.id),
          );
          for (const source of sourceBudgets) {
            const existing = (await budgets.list()).find((budget) =>
              budget.periodId === draft.id && budget.category === source.category,
            );
            if (existing) {
              await budgets.update(existing.id, { allocated: source.allocated, spent: 0 });
            } else {
              await budgets.create({
                category: source.category,
                allocated: source.allocated,
                spent: 0,
                periodId: draft.id,
              });
            }
          }
          return draft.id;
        }
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
        await carryCreditBills();
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
