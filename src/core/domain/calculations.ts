import { Wallet, Transaction, Budget, BudgetPeriod, Saving } from './types';

export function totalLiquidity(wallets: Wallet[]): number {
  return wallets.reduce((s, w) => s + (w.kind === 'credit' ? -Math.abs(w.balance) : w.balance), 0);
}

// ===== Tabungan (earmark di dalam dompet) =====
const activeSavings = (savings: Saving[]) => savings.filter(s => !s.archived);
/** Total uang yang disisihkan di satu dompet tertentu. */
export function reservedInWallet(walletId: string, savings: Saving[]): number {
  return activeSavings(savings).reduce((s, sv) => s + (sv.walletId === walletId ? sv.balance : 0), 0);
}
/** Total uang yang disisihkan di semua dompet. */
export function totalReserved(savings: Saving[]): number {
  return activeSavings(savings).reduce((s, sv) => s + sv.balance, 0);
}
/** Saldo dompet yang benar-benar bebas dipakai (total − yang dikunci di tabungan). */
export function availableBalance(wallet: Wallet, savings: Saving[]): number {
  return wallet.balance - reservedInWallet(wallet.id, savings);
}
export function balanceDelta(tx: Transaction, walletId: string): number {
  if (tx.walletId === walletId) return tx.type === 'income' ? tx.amount : -tx.amount;
  if (tx.type === 'transfer' && tx.toWalletId === walletId) return tx.amount;
  return 0;
}
export function recomputeBalance(opening: number, txs: Transaction[], walletId: string): number {
  return txs.reduce((bal, tx) => bal + balanceDelta(tx, walletId), opening);
}

export interface BudgetView extends Budget { velocity: number; over: boolean; remaining: number; }
export function budgetView(b: Budget): BudgetView {
  const velocity = b.allocated > 0 ? b.spent / b.allocated : 0;
  return { ...b, velocity, over: b.spent > b.allocated, remaining: b.allocated - b.spent };
}
export function safeToSpend(liquidity: number, budgets: Budget[], reserved = 0): number {
  return liquidity - budgets.reduce((s, b) => s + b.allocated, 0) - reserved;
}

export function periodProgress(p: BudgetPeriod, today: Date = new Date()) {
  const start = new Date(p.start), end = new Date(p.end);
  const totalDays = Math.max(1, Math.round((+end - +start) / 86_400_000));
  const dayOf = Math.min(totalDays, Math.max(0, Math.round((+today - +start) / 86_400_000)));
  return { dayOf, totalDays, daysLeft: Math.max(0, totalDays - dayOf), fraction: dayOf / totalDays };
}
export function periodNet(liquidity: number, budgets: Budget[]): number {
  return safeToSpend(liquidity, budgets);
}
