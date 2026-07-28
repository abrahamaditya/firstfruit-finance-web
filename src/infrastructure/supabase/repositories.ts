'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Beneficiary,
  Budget,
  BudgetPeriod,
  Plan,
  Receivable,
  Reminder,
  Saving,
  Subscription,
  Transaction,
  Wallet,
} from '../../core/domain/types';
import type { DataRepositories, Repository } from '../../core/ports/repositories';
import { categoryPath } from '../../core/domain/categories';

type DbRow = Record<string, any>;

const idempotencyKey = () => crypto.randomUUID();
const amount = (value: unknown) => Number(value ?? 0);

function throwIfError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function transactionNature(value: string): Transaction['nature'] {
  return value === 'unexpected' || value === 'non_recurring' ? 'unexpected' : 'fixed';
}

function dbNature(item: Pick<Transaction, 'type' | 'nature'>) {
  if (item.nature === 'unexpected') return 'unexpected';
  return item.type === 'income' ? 'recurring' : 'planned';
}

function mapWallet(row: DbRow): Wallet {
  return {
    id: row.id,
    name: row.name,
    kind: row.wallet_class === 'liability' ? 'credit' : 'debit',
    medium: row.medium,
    bank: row.institution_name ?? undefined,
    last4: row.last4 ?? undefined,
    phone: row.phone_masked ?? undefined,
    cardNetwork: row.card_network ?? undefined,
    balance: amount(row.current_balance_minor),
    creditLimit: row.credit_limit_minor == null ? undefined : amount(row.credit_limit_minor),
  };
}

function mapTransaction(row: DbRow): Transaction {
  const rawType = row.type as string;
  const type: Transaction['type'] =
    rawType === 'credit_payment' ? 'transfer'
      : rawType === 'adjustment' && row.adjustment_effect === 'decrease' ? 'expense'
        : rawType === 'adjustment' ? 'income'
        : rawType as Transaction['type'];
  return {
    id: row.id,
    type,
    nature: transactionNature(row.nature),
    amount: amount(row.amount_minor),
    walletId: row.wallet_id,
    toWalletId: row.to_wallet_id ?? undefined,
    labels: row.category_name
      ? categoryPath(row.category_name, type === 'income' ? 'income' : 'expense')
      : [],
    merchant: row.merchant ?? undefined,
    budgetId: row.budget_id ?? undefined,
    beneficiaryId: row.beneficiary_id ?? undefined,
    settlesReceivableId: row.settles_receivable_id ?? undefined,
    adjustment: rawType === 'adjustment',
    adjustmentReason: rawType === 'adjustment' ? row.note ?? undefined : undefined,
    note: row.note ?? undefined,
    recipient: row.beneficiary_name_snapshot ?? undefined,
    isReceivable: amount(row.owed_amount_minor) > 0 || undefined,
    beneficiary: row.beneficiary_mode ?? undefined,
    owedAmount: row.owed_amount_minor == null ? undefined : amount(row.owed_amount_minor),
    subscriptionId: row.subscription_id ?? undefined,
    savingId: row.saving_id ?? undefined,
    date: row.occurred_at,
  };
}

function mapBudget(row: DbRow): Budget {
  return {
    id: row.id,
    category: row.category_name,
    allocated: amount(row.allocated_minor),
    spent: amount(row.spent_minor),
    periodId: row.period_id,
  };
}

function mapPeriod(row: DbRow): BudgetPeriod {
  return {
    id: row.id,
    alias: row.alias,
    start: new Date(`${row.start_date}T00:00:00`).toISOString(),
    end: new Date(`${row.end_date}T23:59:59`).toISOString(),
    closed: row.status !== 'open',
    status: row.status,
  };
}

function mapSubscription(row: DbRow): Subscription {
  const category = row.categories?.name ?? row.category_name ?? 'Lainnya';
  return {
    id: row.id,
    name: row.name,
    amount: amount(row.amount_minor),
    walletId: row.wallet_id,
    category,
    cycle: row.cycle,
    customIntervalDays: row.custom_interval_days ?? undefined,
    startDate: new Date(`${row.start_date}T12:00:00`).toISOString(),
    endDate: row.end_date ? new Date(`${row.end_date}T12:00:00`).toISOString() : null,
    nextBillingDate: new Date(`${row.next_billing_date}T12:00:00`).toISOString(),
    reminderDaysBefore: row.reminder_days_before,
    status: row.status,
  };
}

function mapReceivable(row: DbRow): Receivable {
  return {
    id: row.id,
    person: row.person_snapshot,
    amount: amount(row.original_amount_minor),
    source: row.source_note || row.source_type,
    date: row.created_at,
    settled: row.status === 'settled' || row.status === 'written_off',
    paid: amount(row.paid_minor),
    settledAt: row.settled_at ?? undefined,
    settledByTxId: row.settled_by_tx_id ?? undefined,
  };
}

function mapPlan(row: DbRow): Plan {
  return {
    id: row.id,
    title: row.title,
    target: amount(row.inputs?.target_minor),
    saved: amount(row.inputs?.saved_minor),
    targetDate: row.target_date ?? undefined,
    status: row.status,
  };
}

function mapSaving(row: DbRow): Saving {
  return {
    id: row.id,
    name: row.name,
    walletId: row.wallet_id,
    balance: amount(row.current_balance_minor),
    target: row.target_minor == null ? undefined : amount(row.target_minor),
    targetDate: row.target_date ?? undefined,
    emoji: row.emoji ?? undefined,
    archived: Boolean(row.archived_at),
  };
}

function mapReminder(row: DbRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    date: row.due_at,
    note: row.note ?? undefined,
    done: row.status === 'done',
    amount: row.amount_minor == null ? undefined : amount(row.amount_minor),
  };
}

function mapBeneficiary(row: DbRow): Beneficiary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    note: row.note ?? undefined,
    archived: Boolean(row.archived_at),
  };
}

export function createSupabaseRepositories(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): DataRepositories {
  async function activePeriodId() {
    const { data, error } = await supabase
      .from('budget_periods')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .single();
    throwIfError(error, 'Gagal mengambil periode aktif');
    return data!.id as string;
  }

  async function ensureCategory(name: string, flow: 'expense' | 'income') {
    const path = categoryPath(name, flow);
    const labels = path.length > 0 ? path : [name.trim() || 'Lainnya'];
    let parentId: string | null = null;

    for (const [index, label] of labels.entries()) {
      const findNode = async () => {
        let query = supabase
          .from('categories')
          .select('id')
          .eq('flow', flow)
          .eq('normalized_name', label.trim().toLowerCase())
          .is('archived_at', null)
          .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
          .limit(1);
        query = parentId === null ? query.is('parent_id', null) : query.eq('parent_id', parentId);
        return query.maybeSingle();
      };

      const { data: existing, error: findError } = await findNode();
      throwIfError(findError, 'Gagal mencari kategori');
      if (existing) {
        parentId = existing.id as string;
        continue;
      }

      const { data, error } = await supabase
        .from('categories')
        .insert({
          workspace_id: workspaceId,
          flow,
          parent_id: parentId,
          depth: index + 1,
          name: label,
          is_system: false,
          created_by: userId,
        })
        .select('id')
        .single();
      if (error?.message.toLowerCase().includes('duplicate')) {
        const { data: raced, error: racedError } = await findNode();
        throwIfError(racedError, 'Gagal mencari kategori');
        if (!raced) throw new Error(`Gagal membuat kategori: ${error.message}`);
        parentId = raced.id as string;
      } else {
        throwIfError(error, 'Gagal membuat kategori');
        parentId = data!.id as string;
      }
    }
    return parentId!;
  }

  async function postPayload(item: Omit<Transaction, 'id'>) {
    let dbType = item.type;
    if (item.type === 'transfer' && item.toWalletId) {
      const { data, error } = await supabase
        .from('wallets')
        .select('wallet_class')
        .eq('workspace_id', workspaceId)
        .eq('id', item.toWalletId)
        .single();
      throwIfError(error, 'Gagal memeriksa wallet tujuan');
      if (data?.wallet_class === 'liability') dbType = 'credit_payment' as Transaction['type'];
    }
    return {
      workspace_id: workspaceId,
      idempotency_key: idempotencyKey(),
      type: dbType,
      nature: dbNature(item),
      amount_minor: item.amount,
      occurred_at: item.date,
      source_wallet_id: item.walletId,
      destination_wallet_id: item.toWalletId ?? null,
      category_name: item.labels[0] ?? null,
      merchant: item.merchant ?? null,
      budget_id: item.budgetId ?? null,
      beneficiary_id: item.beneficiaryId ?? null,
      beneficiary_name: item.recipient ?? null,
      beneficiary_mode: item.beneficiary ?? 'self',
      owed_amount_minor: item.owedAmount ?? null,
      settles_receivable_id: item.settlesReceivableId ?? null,
      subscription_id: item.subscriptionId ?? null,
      saving_id: item.savingId ?? null,
      note: item.note ?? null,
    };
  }

  const wallets: Repository<Wallet> = {
    async list() {
      const { data, error } = await supabase
        .from('wallets').select('*')
        .eq('workspace_id', workspaceId).is('archived_at', null)
        .order('created_at');
      throwIfError(error, 'Gagal memuat wallet');
      return (data ?? []).map(mapWallet);
    },
    async get(id) {
      const { data, error } = await supabase
        .from('wallets').select('*')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
      throwIfError(error, 'Gagal memuat wallet');
      return data ? mapWallet(data) : null;
    },
    async create(item) {
      const payload = {
        workspace_id: workspaceId,
        idempotency_key: idempotencyKey(),
        name: item.name,
        wallet_class: item.kind === 'credit' ? 'liability' : 'asset',
        medium: item.medium ?? (item.kind === 'credit' ? 'credit' : 'bank'),
        institution_name: item.bank ?? null,
        last4: item.last4 ?? null,
        phone_masked: item.phone ?? null,
        credit_limit_minor: item.creditLimit ?? null,
        opening_balance_minor: item.balance,
      };
      const { data, error } = await supabase.rpc('create_wallet_with_network', {
        p_payload: {
          ...payload,
          card_network: item.cardNetwork ?? null,
        },
      });
      throwIfError(error, 'Gagal membuat wallet');
      return (await wallets.get(data as string))!;
    },
    async update(id, patch) {
      const before = await wallets.get(id);
      if (!before) throw new Error('Wallet tidak ditemukan');
      const payload = {
        workspace_id: workspaceId,
        wallet_id: id,
        idempotency_key: idempotencyKey(),
        name: patch.name ?? before.name,
        institution_name: patch.bank ?? before.bank ?? null,
        last4: patch.last4 ?? before.last4 ?? null,
        phone_masked: patch.phone ?? before.phone ?? null,
        card_network: patch.cardNetwork ?? before.cardNetwork ?? null,
        credit_limit_minor: patch.creditLimit ?? before.creditLimit ?? null,
        target_balance_minor: patch.balance ?? before.balance,
        visible_in_feed: false,
        reason: `Penyesuaian saldo ${patch.name ?? before.name}`,
      };
      const { error } = await supabase.rpc('update_wallet_with_network', { p_payload: payload });
      throwIfError(error, 'Gagal memperbarui wallet');
      return (await wallets.get(id))!;
    },
    async remove(id) {
      const { data: candidates, error: candidateError } = await supabase
        .from('wallets').select('id')
        .eq('workspace_id', workspaceId).eq('wallet_class', 'asset')
        .is('archived_at', null).neq('id', id).limit(1);
      throwIfError(candidateError, 'Gagal mencari wallet tujuan');
      const { error } = await supabase.rpc('archive_wallet', {
        p_payload: {
          workspace_id: workspaceId,
          wallet_id: id,
          destination_wallet_id: candidates?.[0]?.id ?? null,
          idempotency_key: idempotencyKey(),
        },
      });
      throwIfError(error, 'Gagal mengarsipkan wallet');
    },
  };

  const transactions: Repository<Transaction> = {
    async list() {
      const { data, error } = await supabase
        .from('v_transactions').select('*')
        .eq('workspace_id', workspaceId)
        // Edit mempertahankan `created_at` transaksi pertama, sehingga card tidak
        // meloncat ke atas hanya karena baru direvisi.
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(500);
      throwIfError(error, 'Gagal memuat transaksi');
      return (data ?? []).map(mapTransaction);
    },
    async get(id) {
      const { data, error } = await supabase
        .from('v_transactions').select('*')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
      throwIfError(error, 'Gagal memuat transaksi');
      return data ? mapTransaction(data) : null;
    },
    async create(item) {
      const payload = await postPayload(item);
      const { data, error } = await supabase.rpc('post_transaction', { p_payload: payload });
      throwIfError(error, 'Gagal memposting transaksi');
      return (await transactions.get(data as string))!;
    },
    async update(id, patch) {
      const before = await transactions.get(id);
      if (!before) throw new Error('Transaksi tidak ditemukan');
      const replacement = await postPayload({ ...before, ...patch });
      const { data, error } = await supabase.rpc('replace_transaction', {
        p_payload: {
          workspace_id: workspaceId,
          transaction_id: id,
          idempotency_key: idempotencyKey(),
          reason: 'Transaksi diedit',
          replacement,
        },
      });
      throwIfError(error, 'Gagal mengganti transaksi');
      return (await transactions.get(data as string))!;
    },
    async remove(id) {
      const { error } = await supabase.rpc('reverse_transaction', {
        p_payload: {
          workspace_id: workspaceId,
          transaction_id: id,
          idempotency_key: idempotencyKey(),
          reason: 'Transaksi dihapus pengguna',
        },
      });
      throwIfError(error, 'Gagal membalik transaksi');
    },
  };

  const budgets: Repository<Budget> = {
    async list() {
      const { data, error } = await supabase
        .from('v_budget_progress').select('*')
        .eq('workspace_id', workspaceId).is('archived_at', null);
      throwIfError(error, 'Gagal memuat anggaran');
      return (data ?? []).map(mapBudget);
    },
    async get(id) {
      const { data, error } = await supabase
        .from('v_budget_progress').select('*')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
      throwIfError(error, 'Gagal memuat anggaran');
      return data ? mapBudget(data) : null;
    },
    async create(item) {
      const categoryId = await ensureCategory(item.category, 'expense');
      const { data, error } = await supabase.from('budgets').insert({
        workspace_id: workspaceId,
        period_id: await activePeriodId(),
        category_id: categoryId,
        allocated_minor: item.allocated,
        created_by: userId,
      }).select('id').single();
      throwIfError(error, 'Gagal membuat anggaran');
      return (await budgets.get(data!.id))!;
    },
    async update(id, patch) {
      const current = await budgets.get(id);
      if (!current) throw new Error('Anggaran tidak ditemukan');
      const categoryId = await ensureCategory(patch.category ?? current.category, 'expense');
      const { error } = await supabase.from('budgets').update({
        category_id: categoryId,
        allocated_minor: patch.allocated ?? current.allocated,
      }).eq('workspace_id', workspaceId).eq('id', id);
      throwIfError(error, 'Gagal memperbarui anggaran');
      return (await budgets.get(id))!;
    },
    async remove(id) {
      const { error } = await supabase.from('budgets')
        .delete().eq('workspace_id', workspaceId).eq('id', id);
      throwIfError(error, 'Gagal menghapus anggaran');
    },
  };

  const periods: Repository<BudgetPeriod> = {
    async list() {
      const { data, error } = await supabase.from('budget_periods').select('*')
        .eq('workspace_id', workspaceId).order('start_date', { ascending: false });
      throwIfError(error, 'Gagal memuat periode');
      return (data ?? []).map(mapPeriod);
    },
    async get(id) {
      const { data, error } = await supabase.from('budget_periods').select('*')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
      throwIfError(error, 'Gagal memuat periode');
      return data ? mapPeriod(data) : null;
    },
    async create(item) {
      const { data: openPeriod, error: openPeriodError } = await supabase
        .from('budget_periods')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();
      throwIfError(openPeriodError, 'Gagal memeriksa periode aktif');
      const { data, error } = await supabase.from('budget_periods').insert({
        workspace_id: workspaceId,
        alias: item.alias,
        start_date: item.start.slice(0, 10),
        end_date: item.end.slice(0, 10),
        status: openPeriod ? 'draft' : 'open',
        created_by: userId,
      }).select('*').single();
      throwIfError(error, 'Gagal membuat periode');
      return mapPeriod(data!);
    },
    async update(id, patch) {
      const changes: DbRow = {};
      if (patch.alias !== undefined) changes.alias = patch.alias;
      if (patch.start !== undefined) changes.start_date = patch.start.slice(0, 10);
      if (patch.end !== undefined) changes.end_date = patch.end.slice(0, 10);
      const { data, error } = await supabase.from('budget_periods').update(changes)
        .eq('workspace_id', workspaceId).eq('id', id).select('*').single();
      throwIfError(error, 'Gagal memperbarui periode');
      return mapPeriod(data!);
    },
    async remove(id) {
      const { error } = await supabase.from('budget_periods').delete()
        .eq('workspace_id', workspaceId).eq('id', id).eq('status', 'draft');
      throwIfError(error, 'Hanya draft periode yang dapat dihapus');
    },
  };

  const subscriptions: Repository<Subscription> = {
    async list() {
      const { data, error } = await supabase.from('subscriptions')
        .select('*, categories(name)')
        .eq('workspace_id', workspaceId).order('next_billing_date');
      throwIfError(error, 'Gagal memuat langganan');
      return (data ?? []).map(mapSubscription);
    },
    async get(id) {
      const { data, error } = await supabase.from('subscriptions')
        .select('*, categories(name)')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
      throwIfError(error, 'Gagal memuat langganan');
      return data ? mapSubscription(data) : null;
    },
    async create(item) {
      const categoryId = await ensureCategory(item.category, 'expense');
      const { data, error } = await supabase.from('subscriptions').insert({
        workspace_id: workspaceId,
        name: item.name,
        amount_minor: item.amount,
        wallet_id: item.walletId,
        category_id: categoryId,
        cycle: item.cycle,
        custom_interval_days: item.customIntervalDays ?? null,
        start_date: item.startDate.slice(0, 10),
        end_date: item.endDate?.slice(0, 10) ?? null,
        next_billing_date: item.nextBillingDate.slice(0, 10),
        reminder_days_before: item.reminderDaysBefore,
        status: item.status,
        created_by: userId,
      }).select('id').single();
      throwIfError(error, 'Gagal membuat langganan');
      return (await subscriptions.get(data!.id))!;
    },
    async update(id, patch) {
      const current = await subscriptions.get(id);
      if (!current) throw new Error('Langganan tidak ditemukan');
      const next = { ...current, ...patch };
      const categoryId = await ensureCategory(next.category, 'expense');
      const { error } = await supabase.from('subscriptions').update({
        name: next.name,
        amount_minor: next.amount,
        wallet_id: next.walletId,
        category_id: categoryId,
        cycle: next.cycle,
        custom_interval_days: next.customIntervalDays ?? null,
        end_date: next.endDate?.slice(0, 10) ?? null,
        next_billing_date: next.nextBillingDate.slice(0, 10),
        reminder_days_before: next.reminderDaysBefore,
        status: next.status,
      }).eq('workspace_id', workspaceId).eq('id', id);
      throwIfError(error, 'Gagal memperbarui langganan');
      return (await subscriptions.get(id))!;
    },
    async remove(id) {
      const { error } = await supabase.from('subscriptions').update({ status: 'cancelled' })
        .eq('workspace_id', workspaceId).eq('id', id);
      throwIfError(error, 'Gagal membatalkan langganan');
    },
  };

  const receivables: Repository<Receivable> = {
    async list() {
      const { data, error } = await supabase.from('v_receivable_balances').select('*')
        .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
      throwIfError(error, 'Gagal memuat piutang');
      return (data ?? []).map(mapReceivable);
    },
    async get(id) {
      const { data, error } = await supabase.from('v_receivable_balances').select('*')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
      throwIfError(error, 'Gagal memuat piutang');
      return data ? mapReceivable(data) : null;
    },
    async create(item) {
      const { data, error } = await supabase.rpc('create_manual_receivable', {
        p_payload: {
          workspace_id: workspaceId,
          idempotency_key: idempotencyKey(),
          person: item.person,
          amount_minor: item.amount,
          occurred_at: item.date,
          source_note: item.source,
        },
      });
      throwIfError(error, 'Gagal membuat piutang');
      return (await receivables.get(data as string))!;
    },
    async update(id, patch) {
      if (patch.settled) {
        await settleReceivable(id);
        return (await receivables.get(id))!;
      }
      throw new Error('Piutang yang sudah diposting tidak dapat diedit. Gunakan pembayaran atau write-off.');
    },
    async remove(id) {
      const { error } = await supabase.rpc('write_off_receivable', {
        p_payload: {
          workspace_id: workspaceId,
          receivable_id: id,
          idempotency_key: idempotencyKey(),
          reason: 'Piutang dihapus pengguna',
        },
      });
      throwIfError(error, 'Gagal melakukan write-off piutang');
    },
  };

  const plans: Repository<Plan> = {
    async list() {
      const { data, error } = await supabase.from('financial_plans').select('*')
        .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
      throwIfError(error, 'Gagal memuat rencana');
      return (data ?? []).map(mapPlan);
    },
    async get(id) {
      const { data, error } = await supabase.from('financial_plans').select('*')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
      throwIfError(error, 'Gagal memuat rencana');
      return data ? mapPlan(data) : null;
    },
    async create(item) {
      const { data, error } = await supabase.from('financial_plans').insert({
        workspace_id: workspaceId,
        type: 'target_fund',
        title: item.title,
        status: item.status,
        inputs: { target_minor: item.target, saved_minor: item.saved },
        target_date: item.targetDate ?? null,
        created_by: userId,
      }).select('*').single();
      throwIfError(error, 'Gagal membuat rencana');
      return mapPlan(data!);
    },
    async update(id, patch) {
      const current = await plans.get(id);
      if (!current) throw new Error('Rencana tidak ditemukan');
      const next = { ...current, ...patch };
      const { data, error } = await supabase.from('financial_plans').update({
        title: next.title,
        status: next.status,
        inputs: { target_minor: next.target, saved_minor: next.saved },
        target_date: next.targetDate ?? null,
      }).eq('workspace_id', workspaceId).eq('id', id).select('*').single();
      throwIfError(error, 'Gagal memperbarui rencana');
      return mapPlan(data!);
    },
    async remove(id) {
      const { error } = await supabase.from('financial_plans').delete()
        .eq('workspace_id', workspaceId).eq('id', id);
      throwIfError(error, 'Gagal menghapus rencana');
    },
  };

  const savings: Repository<Saving> = {
    async list() {
      const { data, error } = await supabase.from('savings_goals').select('*')
        .eq('workspace_id', workspaceId).order('created_at');
      throwIfError(error, 'Gagal memuat tabungan');
      return (data ?? []).map(mapSaving);
    },
    async get(id) {
      const { data, error } = await supabase.from('savings_goals').select('*')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
      throwIfError(error, 'Gagal memuat tabungan');
      return data ? mapSaving(data) : null;
    },
    async create(item) {
      const { data, error } = await supabase.rpc('create_saving_goal', {
        p_payload: {
          workspace_id: workspaceId,
          idempotency_key: idempotencyKey(),
          wallet_id: item.walletId,
          name: item.name,
          balance_minor: 0,
          target_minor: item.target ?? null,
          target_date: item.targetDate ?? null,
          emoji: item.emoji ?? null,
        },
      });
      throwIfError(error, 'Gagal membuat tabungan');
      return (await savings.get(data as string))!;
    },
    async update(id, patch) {
      const current = await savings.get(id);
      if (!current) throw new Error('Tabungan tidak ditemukan');
      const next = { ...current, ...patch };
      const { error } = await supabase.rpc('update_saving_goal', {
        p_payload: {
          workspace_id: workspaceId,
          saving_id: id,
          idempotency_key: idempotencyKey(),
          wallet_id: next.walletId,
          name: next.name,
          target_minor: next.target ?? null,
          target_date: next.targetDate ?? null,
          emoji: next.emoji ?? null,
        },
      });
      throwIfError(error, 'Gagal memperbarui tabungan');
      return (await savings.get(id))!;
    },
    async remove(id) {
      const { error } = await supabase.rpc('archive_saving_goal', {
        p_payload: {
          workspace_id: workspaceId,
          saving_id: id,
          idempotency_key: idempotencyKey(),
        },
      });
      throwIfError(error, 'Gagal mengarsipkan tabungan');
    },
  };

  const reminders: Repository<Reminder> = {
    async list() {
      const { data, error } = await supabase.from('reminders').select('*')
        .eq('workspace_id', workspaceId).order('due_at');
      throwIfError(error, 'Gagal memuat pengingat');
      return (data ?? []).map(mapReminder);
    },
    async get(id) {
      const { data, error } = await supabase.from('reminders').select('*')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
      throwIfError(error, 'Gagal memuat pengingat');
      return data ? mapReminder(data) : null;
    },
    async create(item) {
      const { data, error } = await supabase.from('reminders').insert({
        workspace_id: workspaceId,
        title: item.title,
        due_at: item.date,
        amount_minor: item.amount ?? null,
        note: item.note ?? null,
        status: item.done ? 'done' : 'open',
        completed_at: item.done ? new Date().toISOString() : null,
        completed_by: item.done ? userId : null,
        created_by: userId,
      }).select('*').single();
      throwIfError(error, 'Gagal membuat pengingat');
      return mapReminder(data!);
    },
    async update(id, patch) {
      const current = await reminders.get(id);
      if (!current) throw new Error('Pengingat tidak ditemukan');
      const next = { ...current, ...patch };
      if (patch.done !== undefined) {
        const { error } = await supabase.rpc('mark_reminder_done', {
          p_reminder_id: id,
          p_done: patch.done,
        });
        throwIfError(error, 'Gagal mengubah status pengingat');
      }
      const changes: DbRow = {};
      if (patch.title !== undefined) changes.title = next.title;
      if (patch.date !== undefined) changes.due_at = next.date;
      if (patch.amount !== undefined) changes.amount_minor = next.amount ?? null;
      if (patch.note !== undefined) changes.note = next.note ?? null;
      if (Object.keys(changes).length) {
        const { error } = await supabase.from('reminders').update(changes)
          .eq('workspace_id', workspaceId).eq('id', id);
        throwIfError(error, 'Gagal memperbarui pengingat');
      }
      return (await reminders.get(id))!;
    },
    async remove(id) {
      const { error } = await supabase.from('reminders').delete()
        .eq('workspace_id', workspaceId).eq('id', id);
      throwIfError(error, 'Gagal menghapus pengingat');
    },
  };

  const beneficiaries: Repository<Beneficiary> = {
    async list() {
      const { data, error } = await supabase.from('beneficiaries').select('*')
        .eq('workspace_id', workspaceId).order('name');
      throwIfError(error, 'Gagal memuat pihak terkait');
      return (data ?? []).map(mapBeneficiary);
    },
    async get(id) {
      const { data, error } = await supabase.from('beneficiaries').select('*')
        .eq('workspace_id', workspaceId).eq('id', id).maybeSingle();
      throwIfError(error, 'Gagal memuat pihak terkait');
      return data ? mapBeneficiary(data) : null;
    },
    async create(item) {
      const { data, error } = await supabase.from('beneficiaries').insert({
        workspace_id: workspaceId,
        name: item.name,
        kind: item.kind,
        note: item.note ?? null,
        created_by: userId,
      }).select('*').single();
      throwIfError(error, 'Gagal membuat pihak terkait');
      return mapBeneficiary(data!);
    },
    async update(id, patch) {
      const changes: DbRow = {};
      if (patch.name !== undefined) changes.name = patch.name;
      if (patch.kind !== undefined) changes.kind = patch.kind;
      if (patch.note !== undefined) changes.note = patch.note ?? null;
      if (patch.archived !== undefined) changes.archived_at = patch.archived ? new Date().toISOString() : null;
      const { data, error } = await supabase.from('beneficiaries').update(changes)
        .eq('workspace_id', workspaceId).eq('id', id).select('*').single();
      throwIfError(error, 'Gagal memperbarui pihak terkait');
      return mapBeneficiary(data!);
    },
    async remove(id) {
      const { error } = await supabase.from('beneficiaries').update({ archived_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId).eq('id', id);
      throwIfError(error, 'Gagal mengarsipkan pihak terkait');
    },
  };

  async function defaultAssetWalletId(explicit?: string) {
    if (explicit) return explicit;
    const { data: preference } = await supabase.from('user_workspace_preferences')
      .select('default_wallet_id').eq('user_id', userId).eq('workspace_id', workspaceId).maybeSingle();
    if (preference?.default_wallet_id) return preference.default_wallet_id as string;
    const { data, error } = await supabase.from('wallets').select('id')
      .eq('workspace_id', workspaceId).eq('wallet_class', 'asset').is('archived_at', null).limit(1);
    throwIfError(error, 'Gagal mencari wallet penerimaan');
    if (!data?.[0]) throw new Error('Buat wallet asset sebelum menerima pelunasan piutang');
    return data[0].id as string;
  }

  async function settleReceivable(receivableId: string, walletId?: string) {
    const target = await receivables.get(receivableId);
    if (!target) throw new Error('Piutang tidak ditemukan');
    const remaining = target.amount - (target.paid ?? 0);
    if (remaining <= 0) return;
    const destination = await defaultAssetWalletId(walletId);
    const { error } = await supabase.rpc('post_transaction', {
      p_payload: {
        workspace_id: workspaceId,
        idempotency_key: idempotencyKey(),
        type: 'income',
        nature: 'non_recurring',
        amount_minor: remaining,
        occurred_at: new Date().toISOString(),
        source_wallet_id: destination,
        category_name: 'Pengembalian Piutang',
        beneficiary_name: target.person,
        settles_receivable_id: receivableId,
        note: `Pelunasan piutang ${target.person}`,
      },
    });
    throwIfError(error, 'Gagal mencatat pelunasan piutang');
  }

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
    beneficiaries,
    commands: {
      async closePeriod(periodId, options) {
        const { data, error } = await supabase.rpc('close_budget_period', {
          p_payload: {
            workspace_id: workspaceId,
            period_id: periodId,
            create_next: options.createNext,
            next_alias: options.createNext ? options.nextAlias ?? '' : '',
            copy_budgets: options.createNext,
            idempotency_key: idempotencyKey(),
          },
        });
        throwIfError(error, 'Gagal menutup periode');
        // Tanpa periode berikutnya, RPC memulangkan id periode yang baru saja ditutup.
        return options.createNext ? (data as string) : null;
      },
      async adjustSaving(savingId, value, action) {
        const { error } = await supabase.rpc('adjust_saving', {
          p_payload: {
            workspace_id: workspaceId,
            saving_id: savingId,
            amount_minor: value,
            action,
            idempotency_key: idempotencyKey(),
          },
        });
        throwIfError(error, 'Gagal mengubah tabungan');
      },
      settleReceivable,
      async markReminderDone(reminderId, done) {
        const { error } = await supabase.rpc('mark_reminder_done', {
          p_reminder_id: reminderId,
          p_done: done,
        });
        throwIfError(error, 'Gagal mengubah pengingat');
      },
      async archiveWallet(walletId, destinationWalletId) {
        const { error } = await supabase.rpc('archive_wallet', {
          p_payload: {
            workspace_id: workspaceId,
            wallet_id: walletId,
            destination_wallet_id: destinationWalletId ?? null,
            idempotency_key: idempotencyKey(),
          },
        });
        throwIfError(error, 'Gagal mengarsipkan wallet');
      },
      async finalizeSplitBill(title, participants, receipts) {
        const { data, error } = await supabase.rpc('finalize_split_bill', {
          p_payload: {
            workspace_id: workspaceId,
            idempotency_key: idempotencyKey(),
            title,
            participants: participants.map((participant) => ({
              client_id: participant.id,
              name: participant.name,
              is_current_user: participant.id === 'me',
              color: participant.color,
            })),
            receipts: receipts.map((receipt) => ({
              client_id: receipt.id,
              name: receipt.name,
              payer_id: receipt.payerId,
              tax_percent: receipt.taxPercent,
              items: receipt.items.map((item) => ({
                client_id: item.id,
                name: item.name,
                price_minor: item.price,
                shared_by: item.sharedBy,
              })),
            })),
          },
        });
        throwIfError(error, 'Gagal memfinalisasi split bill');
        return data as string;
      },
    },
  };
}
