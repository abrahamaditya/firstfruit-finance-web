begin;

-- Harga barang/bunga boleh dilengkapi tanpa membalik transaksi awal atau
-- melepaskan alokasi pembayaran yang sudah menandai cicilan lunas.
create or replace function public.update_installment_pricing(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (p_payload ->> 'workspace_id')::uuid;
  v_transaction_id uuid := (p_payload ->> 'transaction_id')::uuid;
  v_item_total bigint := (p_payload ->> 'item_total_minor')::bigint;
  v_interest_total bigint := coalesce((p_payload ->> 'interest_total_minor')::bigint, 0);
  v_pricing_mode text := coalesce(nullif(p_payload ->> 'pricing_mode', ''), 'monthly');
  v_monthly_amount bigint;
  v_tenor smallint;
  v_old_total bigint;
  v_new_total bigint;
begin
  perform private.require_workspace_role(
    v_workspace_id,
    array['owner', 'editor']::public.workspace_role[]
  );

  select t.amount_minor, ti.tenor_months,
         coalesce(ti.item_total_minor + ti.interest_total_minor, t.amount_minor * ti.tenor_months)
    into v_monthly_amount, v_tenor, v_old_total
  from public.transactions t
  join public.transaction_installments ti
    on ti.transaction_id = t.id and ti.workspace_id = t.workspace_id
  where t.workspace_id = v_workspace_id
    and t.id = v_transaction_id
    and t.type = 'expense'
    and t.status = 'posted'
    and t.reversal_of_id is null
  for update of t, ti;
  if not found then
    raise exception 'Installment transaction is unavailable';
  end if;

  if v_item_total is null or v_item_total <= 0 or v_interest_total < 0 then
    raise exception 'Item price must be positive and total interest cannot be negative';
  end if;
  if v_pricing_mode not in ('monthly', 'item_total') then
    raise exception 'Invalid installment pricing mode';
  end if;
  v_new_total := v_item_total + v_interest_total;
  if v_pricing_mode = 'monthly' and v_new_total <> v_monthly_amount * v_tenor then
    raise exception 'Monthly pricing must equal the recorded monthly amount times tenor';
  end if;
  if v_new_total <> v_old_total and exists (
    select 1
    from public.credit_payment_installment_allocations a
    join public.transactions payment
      on payment.id = a.payment_transaction_id and payment.workspace_id = a.workspace_id
    where a.workspace_id = v_workspace_id
      and a.installment_transaction_id = v_transaction_id
      and payment.status = 'posted'
      and payment.reversal_of_id is null
  ) then
    raise exception 'Total payable cannot change after installments have been allocated to card payments';
  end if;

  update public.transaction_installments ti
  set item_total_minor = v_item_total,
      interest_total_minor = v_interest_total,
      pricing_mode = v_pricing_mode
  where ti.workspace_id = v_workspace_id
    and ti.transaction_id = v_transaction_id;

  insert into public.audit_events
    (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  values
    (v_workspace_id, (select auth.uid()), 'installment.pricing_updated',
     'transaction', v_transaction_id,
     jsonb_build_object('total_payable_minor', v_new_total, 'pricing_mode', v_pricing_mode));

  return v_transaction_id;
end;
$$;

revoke all on function public.update_installment_pricing(jsonb) from public;
grant execute on function public.update_installment_pricing(jsonb) to authenticated;

commit;
