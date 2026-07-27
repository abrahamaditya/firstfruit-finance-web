import { Wallet, Transaction, Budget, BudgetPeriod, Subscription, Receivable, Plan, Saving, Reminder, Beneficiary } from '../domain/types';

// Generic CRUD contract — the domain/application layers depend on THIS, never on Firestore.
export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(item: Omit<T, 'id'>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface DataRepositories {
  wallets: Repository<Wallet>;
  transactions: Repository<Transaction>;
  budgets: Repository<Budget>;
  periods: Repository<BudgetPeriod>;
  subscriptions: Repository<Subscription>;
  receivables: Repository<Receivable>;
  plans: Repository<Plan>;
  savings: Repository<Saving>;
  reminders: Repository<Reminder>;
  beneficiaries: Repository<Beneficiary>;
}
