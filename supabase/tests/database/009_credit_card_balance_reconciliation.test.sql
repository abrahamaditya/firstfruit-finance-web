begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

insert into auth.users (
  id, email, raw_user_meta_data, created_at, updated_at
) values (
  '90909090-9090-4090-8090-909090909090',
  'card-reconciliation-owner@example.test',
  '{"display_name":"Card Reconciliation Owner"}'::jsonb,
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '90909090-9090-4090-8090-909090909090', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"90909090-9090-4090-8090-909090909090","role":"authenticated"}',
  true
);

insert into public.budget_periods (
  workspace_id, alias, start_date, end_date, status, created_by
)
select workspace_id, 'Periode Rekonsiliasi Kartu', current_date - 1, current_date + 30, 'open',
  '90909090-9090-4090-8090-909090909090'
from public.workspace_members
where user_id = '90909090-9090-4090-8090-909090909090';

select public.create_wallet_with_network(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '90909090-9090-4090-8090-909090909090'),
  'idempotency_key', '90000000-0000-4000-8000-000000000001',
  'name', 'Rekening Pembayaran',
  'wallet_class', 'asset',
  'medium', 'bank',
  'opening_balance_minor', 10000000
));

-- Reproduce the legacy split: the statement baseline was updated separately,
-- while the ledger projection still held an older manually adjusted amount.
select public.create_wallet_with_network(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '90909090-9090-4090-8090-909090909090'),
  'idempotency_key', '90000000-0000-4000-8000-000000000002',
  'name', 'Kartu Tidak Sinkron',
  'wallet_class', 'liability',
  'medium', 'credit',
  'opening_balance_minor', 2377425,
  'previous_period_bill_minor', 3533693,
  'credit_limit_minor', 9000000
));

select public.post_transaction_with_benefit_scope(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '90909090-9090-4090-8090-909090909090'),
  'idempotency_key', '90000000-0000-4000-8000-000000000003',
  'type', 'expense',
  'nature', 'planned',
  'amount_minor', 154290,
  'occurred_at', now(),
  'source_wallet_id', (select id from public.wallets where name = 'Kartu Tidak Sinkron'),
  'category_name', 'Entertainment'
));
select public.post_transaction_with_benefit_scope(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '90909090-9090-4090-8090-909090909090'),
  'idempotency_key', '90000000-0000-4000-8000-000000000004',
  'type', 'expense',
  'nature', 'planned',
  'amount_minor', 609000,
  'occurred_at', now(),
  'source_wallet_id', (select id from public.wallets where name = 'Kartu Tidak Sinkron'),
  'category_name', 'Health'
));

select is(
  (select current_balance_minor from public.wallets where name = 'Kartu Tidak Sinkron'),
  3140715::bigint,
  'test setup reproduces the stale internal card balance'
);

select lives_ok(
  $command$
    select public.post_credit_payment_with_installments(jsonb_build_object(
      'workspace_id', (select workspace_id from public.workspace_members where user_id = '90909090-9090-4090-8090-909090909090'),
      'idempotency_key', '90000000-0000-4000-8000-000000000005',
      'type', 'credit_payment',
      'nature', 'planned',
      'amount_minor', 3533693,
      'occurred_at', now(),
      'source_wallet_id', (select id from public.wallets where name = 'Rekening Pembayaran'),
      'destination_wallet_id', (select id from public.wallets where name = 'Kartu Tidak Sinkron'),
      'installment_allocations', '[]'::jsonb
    ))
  $command$,
  'a valid old-statement payment reconciles and posts atomically'
);

select is(
  (select current_balance_minor from public.wallets where name = 'Kartu Tidak Sinkron'),
  763290::bigint,
  'card balance retains only current-period purchases after paying the old statement'
);

select is(
  (select current_balance_minor from public.wallets where name = 'Rekening Pembayaran'),
  6466307::bigint,
  'payment source is reduced exactly once'
);

select is(
  (select count(*)::integer from public.transactions
   where note = 'Rekonsiliasi otomatis tagihan kartu sebelum pembayaran'
     and visible_in_feed = false),
  1,
  'reconciliation writes one hidden balanced adjustment'
);

select is(
  public.post_credit_payment_with_installments(jsonb_build_object(
    'workspace_id', (select workspace_id from public.workspace_members where user_id = '90909090-9090-4090-8090-909090909090'),
    'idempotency_key', '90000000-0000-4000-8000-000000000005',
    'type', 'credit_payment',
    'nature', 'planned',
    'amount_minor', 3533693,
    'occurred_at', now(),
    'source_wallet_id', (select id from public.wallets where name = 'Rekening Pembayaran'),
    'destination_wallet_id', (select id from public.wallets where name = 'Kartu Tidak Sinkron'),
    'installment_allocations', '[]'::jsonb
  )),
  (select id from public.transactions
   where idempotency_key = '90000000-0000-4000-8000-000000000005'),
  'retry returns the original payment transaction'
);

select is(
  (select current_balance_minor from public.wallets where name = 'Rekening Pembayaran'),
  6466307::bigint,
  'idempotent retry does not charge the source twice'
);

select * from finish();
rollback;
