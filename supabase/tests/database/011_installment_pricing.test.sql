begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'installment-pricing-owner@example.test',
  '{"display_name":"Installment Pricing Owner"}'::jsonb,
  now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

insert into public.budget_periods (workspace_id, alias, start_date, end_date, status, created_by)
select workspace_id, 'Periode Harga Cicilan', current_date - 1, current_date + 30, 'open',
  '11111111-1111-4111-8111-111111111111'
from public.workspace_members
where user_id = '11111111-1111-4111-8111-111111111111';

select public.create_wallet_with_network(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '11111111-1111-4111-8111-111111111111'),
  'idempotency_key', '11000000-0000-4000-8000-000000000001',
  'name', 'Rekening Harga', 'wallet_class', 'asset', 'medium', 'bank',
  'opening_balance_minor', 1000000
));

select public.create_wallet_with_network(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '11111111-1111-4111-8111-111111111111'),
  'idempotency_key', '11000000-0000-4000-8000-000000000002',
  'name', 'Kartu Harga', 'wallet_class', 'liability', 'medium', 'credit',
  'opening_balance_minor', 600000, 'previous_period_bill_minor', 600000,
  'credit_limit_minor', 3000000
));

select public.post_transaction_with_benefit_scope(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '11111111-1111-4111-8111-111111111111'),
  'idempotency_key', '11000000-0000-4000-8000-000000000003',
  'type', 'expense', 'nature', 'planned', 'amount_minor', 166667,
  'occurred_at', now(),
  'source_wallet_id', (select id from public.wallets where name = 'Kartu Harga'),
  'category_name', 'Installment pricing test',
  'installment_tenor_months', 3, 'installment_paid_months', 0,
  'installment_item_total_minor', 500000,
  'installment_interest_total_minor', 0,
  'installment_pricing_mode', 'item_total'
));

select is(
  (select installment_item_total_minor from public.v_transactions
   where category_name = 'Installment pricing test'),
  500000::bigint,
  'the item price is stored with the installment'
);
select is(
  (select installment_interest_total_minor from public.v_transactions
   where category_name = 'Installment pricing test'),
  0::bigint,
  'zero interest is stored explicitly'
);
select is(
  (select amount_minor from public.v_transactions
   where category_name = 'Installment pricing test'),
  166667::bigint,
  'monthly ledger amount is the rounded first installment'
);

select lives_ok($command$
  select public.post_credit_payment_with_installments(jsonb_build_object(
    'workspace_id', (select workspace_id from public.workspace_members where user_id = '11111111-1111-4111-8111-111111111111'),
    'idempotency_key', '11000000-0000-4000-8000-000000000004',
    'type', 'credit_payment', 'nature', 'planned', 'amount_minor', 333334,
    'occurred_at', now(),
    'source_wallet_id', (select id from public.wallets where name = 'Rekening Harga'),
    'destination_wallet_id', (select id from public.wallets where name = 'Kartu Harga'),
    'installment_allocations', jsonb_build_array(jsonb_build_object(
      'installment_transaction_id', (select id from public.transactions where idempotency_key = '11000000-0000-4000-8000-000000000003'),
      'installments_paid', 2
    ))
  ))
$command$, 'a card payment can cover the first two rounded installments');

select is(
  (select amount_minor from public.credit_payment_installment_allocations
   where installment_transaction_id = (select id from public.transactions where idempotency_key = '11000000-0000-4000-8000-000000000003')),
  333334::bigint,
  'two rounded installments are allocated at their exact sum'
);
select is(
  (select installment_paid_months from public.v_transactions
   where category_name = 'Installment pricing test'),
  2::smallint,
  'progress reflects two allocated installments'
);

select lives_ok($command$
  select public.update_installment_pricing(jsonb_build_object(
    'workspace_id', (select workspace_id from public.workspace_members where user_id = '11111111-1111-4111-8111-111111111111'),
    'transaction_id', (select id from public.transactions where idempotency_key = '11000000-0000-4000-8000-000000000003'),
    'item_total_minor', 450000, 'interest_total_minor', 50000,
    'pricing_mode', 'item_total'
  ))
$command$, 'item price and interest can be completed without reversing paid progress');

select is(
  (select installment_interest_total_minor from public.v_transactions
   where category_name = 'Installment pricing test'),
  50000::bigint,
  'updated interest is visible on the transaction'
);
select is(
  (select amount_minor from public.credit_payment_installment_allocations
   where installment_transaction_id = (select id from public.transactions where idempotency_key = '11000000-0000-4000-8000-000000000003')),
  333334::bigint,
  'editing the price split keeps the existing payment allocation'
);

select * from finish();
rollback;
