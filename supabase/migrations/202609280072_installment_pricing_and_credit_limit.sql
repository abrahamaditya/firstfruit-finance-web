begin;

-- Data lama tetap tanpa harga barang/bunga: nominal bulanan × tenor hanya perkiraan.
alter table public.transaction_installments
  add column item_total_minor bigint,
  add column interest_total_minor bigint,
  add column pricing_mode text,
  add constraint transaction_installments_pricing_complete check (
    (item_total_minor is null and interest_total_minor is null and pricing_mode is null)
    or (item_total_minor > 0 and interest_total_minor >= 0 and pricing_mode in ('monthly', 'item_total'))
  );

-- Posting dan penggantian transaksi melalui fungsi yang sama; metadata harga ikut
-- tersimpan atomik dengan transaksi, bukan lewat pembaruan terpisah dari client.
do $migration$
declare
  v_definition text;
  v_updated text;
  v_anchor constant text := $anchor$
    insert into public.transaction_installments
      (transaction_id, workspace_id, tenor_months, completed_installments)
    values (
      v_transaction_id, v_workspace_id,
      (p_payload ->> 'installment_tenor_months')::smallint,
      coalesce(nullif(p_payload ->> 'installment_paid_months', '')::smallint, 0)
    );$anchor$;
  v_replacement constant text := $replacement$
    if nullif(p_payload ->> 'installment_item_total_minor', '') is null then
      if nullif(p_payload ->> 'installment_interest_total_minor', '') is not null
         or nullif(p_payload ->> 'installment_pricing_mode', '') is not null then
        raise exception 'Installment item price is required when pricing details are supplied';
      end if;
    else
      if (p_payload ->> 'installment_item_total_minor')::bigint <= 0
         or coalesce(nullif(p_payload ->> 'installment_interest_total_minor', '')::bigint, 0) < 0 then
        raise exception 'Installment item price must be positive and interest cannot be negative';
      end if;
      if coalesce(nullif(p_payload ->> 'installment_pricing_mode', ''), 'monthly') not in ('monthly', 'item_total') then
        raise exception 'Invalid installment pricing mode';
      end if;
      if coalesce(nullif(p_payload ->> 'installment_pricing_mode', ''), 'monthly') = 'monthly'
         and (p_payload ->> 'installment_item_total_minor')::bigint
           + coalesce(nullif(p_payload ->> 'installment_interest_total_minor', '')::bigint, 0)
           <> v_amount * (p_payload ->> 'installment_tenor_months')::bigint then
        raise exception 'Monthly installment does not match item price plus interest';
      end if;
      if coalesce(nullif(p_payload ->> 'installment_pricing_mode', ''), 'monthly') = 'item_total'
         and v_amount <> (
           (p_payload ->> 'installment_item_total_minor')::bigint
           + coalesce(nullif(p_payload ->> 'installment_interest_total_minor', '')::bigint, 0)
           + (p_payload ->> 'installment_tenor_months')::bigint - 1
         ) / (p_payload ->> 'installment_tenor_months')::bigint then
        raise exception 'Monthly installment does not match the split item price plus interest';
      end if;
    end if;
    insert into public.transaction_installments
      (transaction_id, workspace_id, tenor_months, completed_installments,
       item_total_minor, interest_total_minor, pricing_mode)
    values (
      v_transaction_id, v_workspace_id,
      (p_payload ->> 'installment_tenor_months')::smallint,
      coalesce(nullif(p_payload ->> 'installment_paid_months', '')::smallint, 0),
      nullif(p_payload ->> 'installment_item_total_minor', '')::bigint,
      case when nullif(p_payload ->> 'installment_item_total_minor', '') is null then null
        else coalesce(nullif(p_payload ->> 'installment_interest_total_minor', '')::bigint, 0) end,
      case when nullif(p_payload ->> 'installment_item_total_minor', '') is null then null
        else coalesce(nullif(p_payload ->> 'installment_pricing_mode', ''), 'monthly') end
    );$replacement$;
begin
  select pg_get_functiondef('public.post_transaction(jsonb)'::regprocedure) into v_definition;
  v_updated := replace(v_definition, v_anchor, v_replacement);
  if v_updated = v_definition then
    raise exception 'Unable to add pricing metadata to post_transaction';
  end if;
  execute v_updated || ';';
end;
$migration$;

-- Pembayaran beberapa bulan harus memakai nominal tepat per angsuran. Bila total
-- tidak habis dibagi tenor, Rp1 sisanya ditempatkan di angsuran paling awal.
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
  v_input jsonb;
  v_installment_transaction_id uuid;
  v_installments_paid smallint;
  v_monthly_amount bigint;
  v_total_payable bigint;
  v_base bigint;
  v_extra bigint;
  v_start bigint;
  v_tenor smallint;
  v_initial_paid smallint;
  v_paid_by_payments bigint;
  v_completed bigint;
  v_remaining bigint;
  v_amount_minor bigint;
  v_total bigint := 0;
begin
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Installment allocations must be an array';
  end if;

  if exists (
    select 1 from public.credit_payment_installment_allocations a
    where a.payment_transaction_id = p_payment_transaction_id
  ) then
    return 0;
  end if;

  for v_input in
    select value from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    v_installment_transaction_id := nullif(coalesce(
      v_input ->> 'installment_transaction_id',
      v_input ->> 'installmentTransactionId'
    ), '')::uuid;
    v_installments_paid := nullif(coalesce(
      v_input ->> 'installments_paid',
      v_input ->> 'installmentsPaid'
    ), '')::smallint;

    if v_installment_transaction_id is null
       or v_installments_paid is null
       or v_installments_paid < 1 then
      raise exception 'Each installment allocation requires a valid transaction and count';
    end if;

    select t.amount_minor,
           coalesce(ti.item_total_minor + ti.interest_total_minor, t.amount_minor * ti.tenor_months),
           ti.tenor_months, ti.completed_installments
      into v_monthly_amount, v_total_payable, v_tenor, v_initial_paid
    from public.transactions t
    join public.transaction_installments ti
      on ti.transaction_id = t.id and ti.workspace_id = t.workspace_id
    join public.transaction_lines tl
      on tl.transaction_id = t.id and tl.workspace_id = t.workspace_id and tl.side = 'credit'
    join public.ledger_accounts la
      on la.id = tl.ledger_account_id and la.workspace_id = t.workspace_id
    where t.id = v_installment_transaction_id
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
      and a.installment_transaction_id = v_installment_transaction_id
      and payment.status = 'posted'
      and payment.reversal_of_id is null;

    v_completed := v_initial_paid + v_paid_by_payments;
    v_remaining := v_tenor - v_completed;
    if v_installments_paid > v_remaining then
      raise exception 'Selected installment only has % payment(s) remaining', v_remaining;
    end if;

    v_base := v_total_payable / v_tenor;
    v_extra := v_total_payable % v_tenor;
    v_start := v_completed;
    v_amount_minor := v_installments_paid * v_base
      + least(v_extra, v_start + v_installments_paid) - least(v_extra, v_start);
    if v_amount_minor <= 0 then
      raise exception 'Installment allocation amount must be positive';
    end if;

    insert into public.credit_payment_installment_allocations (
      workspace_id, payment_transaction_id, installment_transaction_id,
      installments_paid, amount_minor, created_by
    ) values (
      p_workspace_id, p_payment_transaction_id, v_installment_transaction_id,
      v_installments_paid, v_amount_minor, (select auth.uid())
    );
    v_total := v_total + v_amount_minor;
  end loop;

  if v_total > p_payment_amount_minor then
    raise exception 'Installment allocations exceed the credit-card payment amount';
  end if;
  return v_total;
end;
$$;

revoke all on function private.allocate_credit_payment_installments(uuid, uuid, uuid, bigint, jsonb) from public;

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
  max(ti.completed_installments)::smallint as installment_initial_paid_months,
  max(ti.item_total_minor)::bigint as installment_item_total_minor,
  max(ti.interest_total_minor)::bigint as installment_interest_total_minor,
  max(ti.pricing_mode)::text as installment_pricing_mode
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

grant select on public.v_transactions to authenticated;

commit;
