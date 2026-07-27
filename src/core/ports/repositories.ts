import { Wallet, Transaction, Budget, BudgetPeriod, Subscription, Receivable, Plan, Saving, Reminder, Beneficiary } from '../domain/types';
import type { Receipt, SplitPerson } from '../domain/split';

// Kontrak repository generik — domain/application tidak bergantung pada SDK database.
export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(item: Omit<T, 'id'>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface FinanceCommands {
  closePeriod(periodId: string, nextAlias: string): Promise<string>;
  adjustSaving(savingId: string, amount: number, action: 'reserve' | 'release'): Promise<void>;
  settleReceivable(receivableId: string, walletId?: string): Promise<void>;
  markReminderDone(reminderId: string, done: boolean): Promise<void>;
  archiveWallet(walletId: string, destinationWalletId?: string): Promise<void>;
  finalizeSplitBill(title: string, participants: SplitPerson[], receipts: Receipt[]): Promise<string>;
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
  commands: FinanceCommands;
}
