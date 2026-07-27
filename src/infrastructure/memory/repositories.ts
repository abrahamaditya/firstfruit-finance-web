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
  return {
    wallets: new MemoryRepo(seed.seedWallets),
    transactions: new MemoryRepo(seed.seedTransactions),
    budgets: new MemoryRepo(seed.seedBudgets),
    periods: new MemoryRepo(seed.seedPeriods),
    subscriptions: new MemoryRepo(seed.seedSubscriptions),
    receivables: new MemoryRepo(seed.seedReceivables),
    plans: new MemoryRepo(seed.seedPlans),
    savings: new MemoryRepo(seed.seedSavings),
    reminders: new MemoryRepo(seed.seedReminders),
    beneficiaries: new MemoryRepo(seed.seedBeneficiaries),
  };
}
