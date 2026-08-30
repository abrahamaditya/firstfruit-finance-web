begin;

-- A transfer to a credit card settles only the fixed statement from the previous
-- period. Purchases in the open period remain due next period and must never be
-- consumed by an oversized payment.
create or replace function private.credit_card_previous_bill_remaining(
  p_workspace_id uuid,
  p_wallet_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_open_period_id uuid;
  v_previous_bill bigint;
  v_payments bigint;
begin
  select p.id into v_open_period_id
  from public.budget_periods p
  where p.workspace_id = p_workspace_id and p.status = 'open';

  select w.previous_period_bill_minor into v_previous_bill
  from public.wallets w
  where w.workspace_id = p_workspace_id
    and w.id = p_wallet_id
    and w.wallet_class = 'liability'
    and w.archived_at is null;

  if v_previous_bill is null then
    raise exception 'Credit-card wallet is unavailable';
  end if;
  if v_open_period_id is null then
    raise exception 'Workspace has no open period';
  end if;

  select coalesce(sum(t.amount_minor), 0) into v_payments
  from public.v_transactions t
  where t.workspace_id = p_workspace_id
    and t.period_id = v_open_period_id
    and t.type = 'credit_payment'
    and t.to_wallet_id = p_wallet_id;

  return greatest(0, v_previous_bill - v_payments);
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
  v_key uuid := (p_payload ->> 'idempotency_key')::uuid;
  v_payment_transaction_id uuid;
  v_existing_transaction_id uuid;
  v_source_wallet_id uuid := nullif(p_payload ->> 'source_wallet_id', '')::uuid;
  v_destination_wallet_id uuid := nullif(p_payload ->> 'destination_wallet_id', '')::uuid;
  v_payment_amount bigint := (p_payload ->> 'amount_minor')::bigint;
  v_source_balance bigint;
  v_previous_bill_remaining bigint;
  v_allocated_minor bigint;
begin
  if coalesce(nullif(p_payload ->> 'type', ''), '') <> 'credit_payment' then
    raise exception 'This command only posts credit-card payments';
  end if;

  perform private.require_workspace_role(
    v_workspace_id,
    array['owner', 'editor']::public.workspace_role[]
  );

  select t.id into v_existing_transaction_id
  from public.transactions t
  where t.workspace_id = v_workspace_id
    and t.idempotency_key = v_key;
  if v_existing_transaction_id is not null then
    return v_existing_transaction_id;
  end if;

  select w.current_balance_minor into v_source_balance
  from public.wallets w
  where w.workspace_id = v_workspace_id
    and w.id = v_source_wallet_id
    and w.wallet_class = 'asset'
    and w.archived_at is null
  for update;
  if v_source_balance is null then
    raise exception 'Source wallet is unavailable';
  end if;
  if v_payment_amount is null or v_payment_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if v_payment_amount > v_source_balance then
    raise exception 'Saldo dompet asal tidak mencukupi untuk pembayaran kartu';
  end if;

  -- Repair legacy projection drift first. This adjustment and the payment share
  -- one database transaction, so a later validation failure rolls both back.
  perform private.reconcile_credit_card_balance(
    v_workspace_id,
    v_destination_wallet_id
  );
  v_previous_bill_remaining := private.credit_card_previous_bill_remaining(
    v_workspace_id,
    v_destination_wallet_id
  );
  if v_payment_amount > v_previous_bill_remaining then
    raise exception 'Nominal transfer melebihi sisa tagihan periode sebelumnya';
  end if;

  v_payment_transaction_id := public.post_transaction_with_benefit_scope(
    p_payload - 'installment_allocations'
  );
  v_allocated_minor := private.allocate_credit_payment_installments(
    v_workspace_id,
    v_payment_transaction_id,
    v_destination_wallet_id,
    v_payment_amount,
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

revoke all on function private.credit_card_previous_bill_remaining(uuid, uuid) from public;
revoke all on function public.post_credit_payment_with_installments(jsonb) from public;
grant execute on function public.post_credit_payment_with_installments(jsonb) to authenticated;

commit;
