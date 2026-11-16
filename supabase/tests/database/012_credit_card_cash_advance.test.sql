begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (
  id, email, raw_user_meta_data, created_at, updated_at
) values (
  '12121212-1212-4121-8121-121212121212',
  'cash-advance-owner@example.test',
  '{"display_name":"Cash Advance Owner"}'::jsonb,
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"12121212-1212-4121-8121-121212121212","role":"authenticated"}',
  true
);

insert into public.budget_periods (
  workspace_id, alias, start_date, end_date, status, created_by
)
select workspace_id, 'Periode Tarik Tunai', current_date - 1, current_date + 30, 'open',
  '12121212-1212-4121-8121-121212121212'
from public.workspace_members
where user_id = '12121212-1212-4121-8121-121212121212';

select public.create_wallet_with_network(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '12121212-1212-4121-8121-121212121212'),
  'idempotency_key', '12000000-0000-4000-8000-000000000001',
  'name', 'Rekening Tarik Tunai',
  'wallet_class', 'asset',
  'medium', 'bank',
  'opening_balance_minor', 1000000
));

select public.create_wallet_with_network(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '12121212-1212-4121-8121-121212121212'),
  'idempotency_key', '12000000-0000-4000-8000-000000000002',
  'name', 'Kartu Tarik Tunai',
  'wallet_class', 'liability',
  'medium', 'credit',
  'opening_balance_minor', 500000,
  'previous_period_bill_minor', 500000,
  'credit_limit_minor', 3000000
));

select public.create_wallet_with_network(jsonb_build_object(
  'workspace_id', (select workspace_id from public.workspace_members where user_id = '12121212-1212-4121-8121-121212121212'),
  'idempotency_key', '12000000-0000-4000-8000-000000000003',
  'name', 'Kartu Lain',
  'wallet_class', 'liability',
  'medium', 'credit',
  'opening_balance_minor', 0,
  'previous_period_bill_minor', 0,
  'credit_limit_minor', 3000000
));

select lives_ok(
  $command$
    select public.post_transaction_with_benefit_scope(jsonb_build_object(
      'workspace_id', (select workspace_id from public.workspace_members where user_id = '12121212-1212-4121-8121-121212121212'),
      'idempotency_key', '12000000-0000-4000-8000-000000000010',
      'type', 'transfer',
      'nature', 'planned',
      'amount_minor', 1000000,
      'occurred_at', now(),
      'source_wallet_id', (select id from public.wallets where name = 'Kartu Tarik Tunai'),
      'destination_wallet_id', (select id from public.wallets where name = 'Rekening Tarik Tunai')
    ))
  $command$,
  'a credit card can transfer cash to an asset wallet'
);

select is(
  (select current_balance_minor from public.wallets where name = 'Kartu Tarik Tunai'),
  1500000::bigint,
  'cash advance increases the card debt'
);

select is(
  (select current_balance_minor from public.wallets where name = 'Rekening Tarik Tunai'),
  2000000::bigint,
  'cash advance increases the destination balance'
);

select is(
  (select category_name from public.v_transactions
   where id = (select id from public.transactions where idempotency_key = '12000000-0000-4000-8000-000000000010')),
  'Tarik Tunai Kartu Kredit',
  'cash advance carries its system tag'
);

select is(
  (select wallet_id::text || '>' || to_wallet_id::text from public.v_transactions
   where id = (select id from public.transactions where idempotency_key = '12000000-0000-4000-8000-000000000010')),
  (select (select id from public.wallets where name = 'Kartu Tarik Tunai')::text
     || '>' || (select id from public.wallets where name = 'Rekening Tarik Tunai')::text),
  'feed exposes the card as source and the asset wallet as destination'
);

select throws_ok(
  $command$
    select public.post_transaction_with_benefit_scope(jsonb_build_object(
      'workspace_id', (select workspace_id from public.workspace_members where user_id = '12121212-1212-4121-8121-121212121212'),
      'idempotency_key', '12000000-0000-4000-8000-000000000011',
      'type', 'transfer',
      'nature', 'planned',
      'amount_minor', 100000,
      'occurred_at', now(),
      'source_wallet_id', (select id from public.wallets where name = 'Kartu Tarik Tunai'),
      'destination_wallet_id', (select id from public.wallets where name = 'Kartu Lain')
    ))
  $command$,
  'Transfer requires two distinct asset wallets, a saving reserve, or a credit-card cash advance to an asset wallet',
  'a credit card cannot transfer to another credit card'
);

select throws_ok(
  $command$
    select public.post_transaction_with_benefit_scope(jsonb_build_object(
      'workspace_id', (select workspace_id from public.workspace_members where user_id = '12121212-1212-4121-8121-121212121212'),
      'idempotency_key', '12000000-0000-4000-8000-000000000012',
      'type', 'transfer',
      'nature', 'planned',
      'amount_minor', 2000000,
      'occurred_at', now(),
      'source_wallet_id', (select id from public.wallets where name = 'Kartu Tarik Tunai'),
      'destination_wallet_id', (select id from public.wallets where name = 'Rekening Tarik Tunai')
    ))
  $command$,
  'Transaksi melampaui limit kredit',
  'cash advance cannot exceed the credit limit'
);

-- Pembayaran tagihan lalu memicu rekonsiliasi saldo kartu. Tarik tunai periode ini
-- harus tetap menjadi utang setelahnya.
select lives_ok(
  $command$
    select public.post_credit_payment_with_installments(jsonb_build_object(
      'workspace_id', (select workspace_id from public.workspace_members where user_id = '12121212-1212-4121-8121-121212121212'),
      'idempotency_key', '12000000-0000-4000-8000-000000000013',
      'type', 'credit_payment',
      'nature', 'planned',
      'amount_minor', 500000,
      'occurred_at', now(),
      'source_wallet_id', (select id from public.wallets where name = 'Rekening Tarik Tunai'),
      'destination_wallet_id', (select id from public.wallets where name = 'Kartu Tarik Tunai'),
      'installment_allocations', '[]'::jsonb
    ))
  $command$,
  'previous statement can still be paid after a cash advance'
);

select is(
  (select current_balance_minor from public.wallets where name = 'Kartu Tarik Tunai'),
  1000000::bigint,
  'reconciliation keeps the cash advance as card debt'
);

select lives_ok(
  $command$
    select public.reverse_transaction(jsonb_build_object(
      'workspace_id', (select workspace_id from public.workspace_members where user_id = '12121212-1212-4121-8121-121212121212'),
      'transaction_id', (select id from public.transactions where idempotency_key = '12000000-0000-4000-8000-000000000010'),
      'idempotency_key', '12000000-0000-4000-8000-000000000014',
      'reason', 'Tarik tunai dibatalkan'
    ))
  $command$,
  'a cash advance can be reversed'
);

select * from finish();
rollback;
