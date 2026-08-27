begin;

-- Satu pembayaran kartu dapat melunasi beberapa cicilan. Alokasi ini hanya
-- menjelaskan bagian pembayaran yang menutup cicilan; pembayaran itu sendiri
-- tetap satu transaksi settlement liabilitas agar tidak dihitung sebagai beban baru.
create table public.credit_payment_installment_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  payment_transaction_id uuid not null references public.transactions(id) on delete restrict,
  installment_transaction_id uuid not null references public.transactions(id) on delete restrict,
  installments_paid smallint not null check (installments_paid > 0),
  amount_minor bigint not null check (amount_minor > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint credit_payment_installment_allocations_unique
    unique (payment_transaction_id, installment_transaction_id),
  constraint credit_payment_installment_allocations_not_self
    check (payment_transaction_id <> installment_transaction_id)
);

create index credit_payment_installment_allocations_source_idx
  on public.credit_payment_installment_allocations (workspace_id, installment_transaction_id);

alter table public.credit_payment_installment_allocations enable row level security;

create policy credit_payment_installment_allocations_select_member
  on public.credit_payment_installment_allocations for select to authenticated
  using (private.is_workspace_member(workspace_id));

grant select on public.credit_payment_installment_allocations to authenticated;

-- Semua perhitungan nominal angsuran ada di server supaya client tidak bisa
-- mengubah nominal atau melunasi lebih banyak dari sisa tenor. Pembagian Rupiah
-- yang tidak habis dibagi tenor dibebankan ke angsuran paling awal.
create or replace function private.allocate_credit_payment_installments(
  p_workspace_id uuid,
  p_payment_transaction_id uuid,
  p_destination_wallet_id uuid,
  p_payment_amount_minor bigint,
  p_allocations jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input record;
  v_purchase_amount bigint;
  v_tenor smallint;
  v_initial_paid smallint;
  v_paid_by_payments bigint;
  v_completed bigint;
  v_remaining bigint;
  v_base bigint;
  v_remainder bigint;
  v_amount_minor bigint;
  v_total bigint := 0;
begin
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Installment allocations must be an array';
  end if;

  -- Pengulangan request dengan idempotency key yang sama tidak boleh
  -- menggandakan pelunasan cicilan.
  if exists (
    select 1
    from public.credit_payment_installment_allocations a
    where a.payment_transaction_id = p_payment_transaction_id
  ) then
    return 0;
  end if;

  for v_input in
    select *
    from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
      installment_transaction_id uuid,
      installments_paid smallint
    )
  loop
    if v_input.installment_transaction_id is null
       or v_input.installments_paid is null
       or v_input.installments_paid < 1 then
      raise exception 'Each installment allocation requires a valid transaction and count';
    end if;

    select t.amount_minor, ti.tenor_months, ti.completed_installments
      into v_purchase_amount, v_tenor, v_initial_paid
    from public.transactions t
    join public.transaction_installments ti
      on ti.transaction_id = t.id and ti.workspace_id = t.workspace_id
    join public.transaction_lines tl
      on tl.transaction_id = t.id and tl.workspace_id = t.workspace_id and tl.side = 'credit'
    join public.ledger_accounts la
      on la.id = tl.ledger_account_id and la.workspace_id = t.workspace_id
    where t.id = v_input.installment_transaction_id
      and t.workspace_id = p_workspace_id
      and t.type = 'expense'
      and t.status = 'posted'
      and t.reversal_of_id is null
      and la.wallet_id = p_destination_wallet_id
    for update of t, ti;

    if not found then
      raise exception 'Selected installment is unavailable for this credit card';
    end if;

    select coalesce(sum(a.installments_paid), 0)
      into v_paid_by_payments
    from public.credit_payment_installment_allocations a
    join public.transactions payment
      on payment.id = a.payment_transaction_id
      and payment.workspace_id = a.workspace_id
    where a.workspace_id = p_workspace_id
      and a.installment_transaction_id = v_input.installment_transaction_id
      and payment.status = 'posted'
      and payment.reversal_of_id is null;

    v_completed := v_initial_paid + v_paid_by_payments;
    v_remaining := v_tenor - v_completed;
    if v_input.installments_paid > v_remaining then
      raise exception 'Selected installment only has % payment(s) remaining', v_remaining;
    end if;

    v_base := v_purchase_amount / v_tenor;
    v_remainder := v_purchase_amount % v_tenor;
    v_amount_minor := v_input.installments_paid * v_base
      + greatest(
        0,
        least(v_remainder, v_completed + v_input.installments_paid)
          - least(v_remainder, v_completed)
      );
    if v_amount_minor <= 0 then
      raise exception 'Installment allocation amount must be positive';
    end if;

    insert into public.credit_payment_installment_allocations (
      workspace_id,
      payment_transaction_id,
      installment_transaction_id,
      installments_paid,
      amount_minor,
      created_by
    ) values (
      p_workspace_id,
      p_payment_transaction_id,
      v_input.installment_transaction_id,
      v_input.installments_paid,
      v_amount_minor,
      (select auth.uid())
    );
    v_total := v_total + v_amount_minor;
  end loop;

  if v_total > p_payment_amount_minor then
    raise exception 'Installment allocations exceed the credit-card payment amount';
  end if;
  return v_total;
end;
$$;

create or replace function public.post_credit_payment_with_installments(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (p_payload ->> 'workspace_id')::uuid;
  v_payment_transaction_id uuid;
  v_destination_wallet_id uuid := nullif(p_payload ->> 'destination_wallet_id', '')::uuid;
  v_allocated_minor bigint;
begin
  if coalesce(nullif(p_payload ->> 'type', ''), '') <> 'credit_payment' then
    raise exception 'This command only posts credit-card payments';
  end if;

  v_payment_transaction_id := public.post_transaction_with_benefit_scope(
    p_payload - 'installment_allocations'
  );
  v_allocated_minor := private.allocate_credit_payment_installments(
    v_workspace_id,
    v_payment_transaction_id,
    v_destination_wallet_id,
    (p_payload ->> 'amount_minor')::bigint,
    p_payload -> 'installment_allocations'
  );

  if v_allocated_minor > 0 then
    insert into public.audit_events
      (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
    values
      (v_workspace_id, (select auth.uid()), 'credit_payment.installments_allocated',
       'transaction', v_payment_transaction_id,
       jsonb_build_object('allocated_minor', v_allocated_minor));
  end if;
  return v_payment_transaction_id;
end;
$$;

-- `installment_paid_months` adalah posisi cicilan yang hidup saat ini: baseline
-- yang diisikan ketika transaksi lama dicatat + alokasi pembayaran yang masih posted.
-- Karena pembayaran yang dibalik tidak lagi berstatus posted, jumlah ini otomatis turun.
create or replace view public.v_transactions
with (security_invoker = true)
as
select
  t.id, t.workspace_id, t.type, t.status, t.nature, t.amount_minor, t.currency_code,
  t.occurred_at, t.period_id, t.category_id,
  coalesce(t.category_name_snapshot, c.name) as category_name,
  t.merchant, t.recipient, t.owed_amount_minor, t.subscription_id, t.split_bill_id,
  t.note, t.reversal_of_id, t.replaced_by_id, t.created_by, t.created_at,
  (max(la.wallet_id::text) filter (where
    (t.type in ('expense', 'transfer', 'credit_payment') and tl.side = 'credit')
    or (t.type = 'income' and tl.side = 'debit')
    or (t.type = 'adjustment' and la.wallet_id is not null)
  ))::uuid as wallet_id,
  (max(la.wallet_id::text) filter (where t.type in ('transfer', 'credit_payment') and tl.side = 'debit'))::uuid as to_wallet_id,
  max(tba.budget_id::text)::uuid as budget_id,
  (max(rp.receivable_id::text) filter (where rp.reversed_at is null))::uuid as settles_receivable_id,
  max(sm.saving_id::text)::uuid as saving_id,
  max(case
    when t.type = 'adjustment' and w.wallet_class = 'asset' and tl.side = 'debit' then 'increase'
    when t.type = 'adjustment' and w.wallet_class = 'liability' and tl.side = 'credit' then 'increase'
    when t.type = 'adjustment' and w.id is not null then 'decrease'
    else null
  end) as adjustment_effect,
  max(ti.tenor_months)::smallint as installment_tenor_months,
  t.benefit_scope,
  (
    coalesce(max(ti.completed_installments), 0)::bigint
    + coalesce((
      select sum(a.installments_paid)::bigint
      from public.credit_payment_installment_allocations a
      join public.transactions payment
        on payment.id = a.payment_transaction_id
        and payment.workspace_id = a.workspace_id
      where a.workspace_id = t.workspace_id
        and a.installment_transaction_id = t.id
        and payment.status = 'posted'
        and payment.reversal_of_id is null
    ), 0)
  )::smallint as installment_paid_months,
  max(ti.completed_installments)::smallint as installment_initial_paid_months
from public.transactions t
left join public.categories c on c.id = t.category_id
left join public.transaction_lines tl on tl.transaction_id = t.id
left join public.ledger_accounts la on la.id = tl.ledger_account_id
left join public.wallets w on w.id = la.wallet_id and w.workspace_id = t.workspace_id
left join public.transaction_budget_allocations tba on tba.transaction_id = t.id
left join public.receivable_payments rp on rp.transaction_id = t.id
left join public.saving_movements sm on sm.transaction_id = t.id
left join public.transaction_installments ti on ti.transaction_id = t.id
where t.status = 'posted' and t.reversal_of_id is null and t.visible_in_feed
group by t.id, c.name;

revoke all on function private.allocate_credit_payment_installments(uuid, uuid, uuid, bigint, jsonb) from public;
grant execute on function public.post_credit_payment_with_installments(jsonb) to authenticated;
grant select on public.v_transactions to authenticated;

commit;
