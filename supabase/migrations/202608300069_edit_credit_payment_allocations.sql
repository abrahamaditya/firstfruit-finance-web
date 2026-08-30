begin;

-- Financial lines of a posted card payment stay immutable. Its installment
-- allocation is editable metadata and can be replaced atomically without
-- reversing, deleting, or reposting the payment itself.
create or replace function public.update_credit_payment_installments(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (p_payload ->> 'workspace_id')::uuid;
  v_transaction_id uuid := (p_payload ->> 'transaction_id')::uuid;
  v_transaction public.transactions;
  v_destination_wallet_id uuid;
  v_allocated_minor bigint;
begin
  perform private.require_workspace_role(
    v_workspace_id,
    array['owner', 'editor']::public.workspace_role[]
  );

  select * into v_transaction
  from public.transactions t
  where t.workspace_id = v_workspace_id
    and t.id = v_transaction_id
    and t.type = 'credit_payment'
    and t.status = 'posted'
    and t.reversal_of_id is null
  for update;
  if not found then
    raise exception 'Credit-card payment is unavailable';
  end if;

  select la.wallet_id into v_destination_wallet_id
  from public.transaction_lines tl
  join public.ledger_accounts la
    on la.workspace_id = tl.workspace_id and la.id = tl.ledger_account_id
  join public.wallets w
    on w.workspace_id = la.workspace_id and w.id = la.wallet_id
  where tl.workspace_id = v_workspace_id
    and tl.transaction_id = v_transaction_id
    and tl.side = 'debit'
    and w.wallet_class = 'liability'
  limit 1;
  if v_destination_wallet_id is null then
    raise exception 'Credit-card destination is unavailable';
  end if;

  delete from public.credit_payment_installment_allocations a
  where a.workspace_id = v_workspace_id
    and a.payment_transaction_id = v_transaction_id;

  v_allocated_minor := private.allocate_credit_payment_installments(
    v_workspace_id,
    v_transaction_id,
    v_destination_wallet_id,
    v_transaction.amount_minor,
    coalesce(p_payload -> 'installment_allocations', '[]'::jsonb)
  );

  insert into public.audit_events
    (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  values
    (v_workspace_id, (select auth.uid()), 'credit_payment.installments_updated',
     'transaction', v_transaction_id,
     jsonb_build_object('allocated_minor', v_allocated_minor));

  return v_transaction_id;
end;
$$;

revoke all on function public.update_credit_payment_installments(jsonb) from public;
grant execute on function public.update_credit_payment_installments(jsonb) to authenticated;

commit;
