begin;

-- The TypeScript domain uses camelCase while PostgreSQL command payloads use
-- snake_case. Accept both formats so an already-open form or an older deployed
-- client cannot turn valid allocation values into NULL during jsonb parsing.
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

  if exists (
    select 1
    from public.credit_payment_installment_allocations a
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

    select t.amount_minor, ti.tenor_months, ti.completed_installments
      into v_purchase_amount, v_tenor, v_initial_paid
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

    v_base := v_purchase_amount / v_tenor;
    v_remainder := v_purchase_amount % v_tenor;
    v_amount_minor := v_installments_paid * v_base
      + greatest(
        0,
        least(v_remainder, v_completed + v_installments_paid)
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
      v_installment_transaction_id,
      v_installments_paid,
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

revoke all on function private.allocate_credit_payment_installments(uuid, uuid, uuid, bigint, jsonb) from public;

commit;
