begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (
  id, email, raw_user_meta_data, created_at, updated_at
) values (
  '10101010-1010-4010-8010-101010101010',
  'allocation-format-owner@example.test',
  '{"display_name":"Allocation Format Owner"}'::jsonb,
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10101010-1010-4010-8010-101010101010', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10101010-1010-4010-8010-101010101010","role":"authenticated"}',
  true
);

insert into public.budget_periods (
  workspace_id, alias, start_date, end_date, status, created_by
)
select workspace_id, 'Periode Format Alokasi', current_date - 1, current_date + 30, 'open',
  '10101010-1010-4010-8010-101010101010'
from public.workspace_members
where user_id = '10101010-1010-4010-8010-101010101010';

select public.create_wallet_with_network(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '10101010-1010-4010-8010-101010101010'),
  'idempotency_key', '10000000-0000-4000-8000-000000000001',
  'name', 'Rekening Alokasi',
  'wallet_class', 'asset',
  'medium', 'bank',
  'opening_balance_minor', 1000000
));

select public.create_wallet_with_network(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '10101010-1010-4010-8010-101010101010'),
  'idempotency_key', '10000000-0000-4000-8000-000000000002',
  'name', 'Kartu Alokasi',
  'wallet_class', 'liability',
  'medium', 'credit',
  'opening_balance_minor', 300000,
  'previous_period_bill_minor', 300000,
  'credit_limit_minor', 3000000
));

select public.post_transaction_with_benefit_scope(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '10101010-1010-4010-8010-101010101010'),
  'idempotency_key', '10000000-0000-4000-8000-000000000003',
  'type', 'expense',
  'nature', 'planned',
  'amount_minor', 300000,
  'occurred_at', now(),
  'source_wallet_id', (select id from public.wallets where name = 'Kartu Alokasi'),
  'category_name', 'Installment format test',
  'installment_tenor_months', 3,
  'installment_paid_months', 0
));

select lives_ok(
  $command$
    select public.post_credit_payment_with_installments(jsonb_build_object(
      'workspace_id', (select workspace_id from public.workspace_members where user_id = '10101010-1010-4010-8010-101010101010'),
      'idempotency_key', '10000000-0000-4000-8000-000000000004',
      'type', 'credit_payment',
      'nature', 'planned',
      'amount_minor', 300000,
      'occurred_at', now(),
      'source_wallet_id', (select id from public.wallets where name = 'Rekening Alokasi'),
      'destination_wallet_id', (select id from public.wallets where name = 'Kartu Alokasi'),
      'installment_allocations', jsonb_build_array(jsonb_build_object(
        'installmentTransactionId', (select id from public.transactions where idempotency_key = '10000000-0000-4000-8000-000000000003'),
        'installmentsPaid', 1
      ))
    ))
  $command$,
  'camelCase allocation from an older client is accepted'
);

select is(
  (select count(*)::integer from public.credit_payment_installment_allocations),
  1,
  'one allocation row is stored'
);

select is(
  (select installment_paid_months from public.v_transactions
   where id = (select id from public.transactions
     where idempotency_key = '10000000-0000-4000-8000-000000000003')),
  1::smallint,
  'the allocated installment advances by one payment'
);

select is(
  (select current_balance_minor from public.wallets where name = 'Kartu Alokasi'),
  300000::bigint,
  'paying the old statement leaves current-period card spending untouched'
);

select lives_ok(
  $command$
    select public.update_credit_payment_installments(jsonb_build_object(
      'workspace_id', (select workspace_id from public.workspace_members where user_id = '10101010-1010-4010-8010-101010101010'),
      'transaction_id', (select id from public.transactions where idempotency_key = '10000000-0000-4000-8000-000000000004'),
      'installment_allocations', '[]'::jsonb
    ))
  $command$,
  'an existing payment allocation can be cleared without reposting'
);

select is(
  (select count(*)::integer from public.credit_payment_installment_allocations),
  0,
  'clearing removes the old allocation row'
);

select is(
  (select installment_paid_months from public.v_transactions
   where id = (select id from public.transactions
     where idempotency_key = '10000000-0000-4000-8000-000000000003')),
  0::smallint,
  'clearing the allocation restores the installment progress'
);

select lives_ok(
  $command$
    select public.update_credit_payment_installments(jsonb_build_object(
      'workspace_id', (select workspace_id from public.workspace_members where user_id = '10101010-1010-4010-8010-101010101010'),
      'transaction_id', (select id from public.transactions where idempotency_key = '10000000-0000-4000-8000-000000000004'),
      'installment_allocations', jsonb_build_array(jsonb_build_object(
        'installment_transaction_id', (select id from public.transactions where idempotency_key = '10000000-0000-4000-8000-000000000003'),
        'installments_paid', 2
      ))
    ))
  $command$,
  'an existing payment can be reallocated directly'
);

select is(
  (select installment_paid_months from public.v_transactions
   where id = (select id from public.transactions
     where idempotency_key = '10000000-0000-4000-8000-000000000003')),
  2::smallint,
  'edited allocation is reflected in installment progress'
);

select is(
  (select current_balance_minor from public.wallets where name = 'Kartu Alokasi'),
  300000::bigint,
  'editing allocation does not change the payment or wallet balance'
);

select * from finish();
rollback;
