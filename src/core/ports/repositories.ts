import { Wallet, Transaction, Budget, BudgetPeriod, Subscription, Receivable, Plan, Saving, Reminder } from '../domain/types';
import type { Receipt, SplitPerson } from '../domain/split';

// Kontrak repository generik — domain/application tidak bergantung pada SDK database.
export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(item: Omit<T, 'id'>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

/** Tutup buku: periode selalu dikunci, membuka periode berikutnya bersifat pilihan. */
export interface ClosePeriodOptions {
  createNext: boolean;
  nextAlias?: string;
  /** Draft yang sudah ada dan akan dijadikan periode berjalan setelah penutupan. */
  targetDraftId?: string;
  /** Anggaran periode berjalan yang dibuat ulang di periode berikutnya. */
  budgetIds?: string[];
}

export interface CreatePeriodOptions {
  alias: string;
  start: string;
  end: string;
  budgetIds?: string[];
  /** Tutup periode berjalan dan buka periode yang baru dibuat secara atomik. */
  closeCurrent?: boolean;
}

/** Detail penerimaan saat piutang dilunasi. */
export interface SettleReceivableOptions {
  walletId?: string;
  occurredAt?: string;
  note?: string;
}

export interface FinanceCommands {
  /** Membuat periode dan, bila dipilih, menduplikasi template anggarannya. */
  createPeriod(options: CreatePeriodOptions): Promise<string>;
  /** Membuka periode draft ketika workspace belum memiliki periode berjalan. */
  openPeriod(periodId: string): Promise<void>;
  /** Mengembalikan id periode baru, atau null bila ditutup tanpa membuka periode berikutnya. */
  closePeriod(periodId: string, options: ClosePeriodOptions): Promise<string | null>;
  adjustSaving(savingId: string, amount: number, action: 'reserve' | 'release'): Promise<void>;
  settleReceivable(receivableId: string, options?: SettleReceivableOptions): Promise<void>;
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
  commands: FinanceCommands;
}
