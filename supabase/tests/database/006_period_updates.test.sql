begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

insert into auth.users (
  id, email, raw_user_meta_data, created_at, updated_at
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'period-owner@example.test',
  '{"display_name":"Period Owner"}'::jsonb,
  now(),
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}',
  true
);

insert into public.budget_periods (
  workspace_id, alias, start_date, end_date, status, created_by
)
select workspace_id, 'Periode Aktif', current_date, current_date + 30, 'open',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
from public.workspace_members
where user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

insert into public.budget_periods (
  workspace_id, alias, start_date, end_date, status, created_by
)
select workspace_id, 'Periode Draft', current_date + 32, current_date + 60, 'draft',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
from public.workspace_members
where user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

select lives_ok(
  $command$
    update public.budget_periods
    set end_date = end_date + 1
    where alias = 'Periode Aktif'
  $command$,
  'owner can update an open period'
);
select is(
  (select end_date from public.budget_periods where alias = 'Periode Aktif'),
  current_date + 31,
  'open period date is updated'
);

select lives_ok(
  $command$
    update public.budget_periods
    set start_date = start_date + 1
    where alias = 'Periode Draft'
  $command$,
  'owner can update a draft period'
);
select is(
  (select start_date from public.budget_periods where alias = 'Periode Draft'),
  current_date + 33,
  'draft period date is updated'
);

reset role;
insert into public.budget_periods (
  workspace_id, alias, start_date, end_date, status, closed_at, closed_by, created_by
)
select workspace_id, 'Periode Arsip', current_date - 60, current_date - 31, 'closed', now(),
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
from public.workspace_members
where user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}',
  true
);

select lives_ok(
  $command$
    update public.budget_periods
    set alias = 'Arsip Diubah'
    where alias = 'Periode Arsip'
  $command$,
  'an attempted closed-period update is safely ignored by RLS'
);
select is(
  (select alias from public.budget_periods where alias = 'Periode Arsip'),
  'Periode Arsip',
  'closed period remains immutable'
);

select * from finish();
rollback;
