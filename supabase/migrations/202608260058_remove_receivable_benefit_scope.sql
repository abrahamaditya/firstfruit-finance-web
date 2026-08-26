begin;

-- Pembentukan piutang bukan pemanfaatan dana. Nilai NULL membedakannya dari
-- pengeluaran pribadi, bersama, atau Giving pada transaksi lama maupun baru.
alter table public.transactions
  alter column benefit_scope drop default,
  alter column benefit_scope drop not null;

-- Migrasi sistem boleh memperbaiki metadata historis tanpa mengubah nilai/jurnal
-- transaksi. Trigger imutabilitas menuntut flag ini untuk setiap update posted row.
select set_config('firstfruit.internal_write', 'on', true);

update public.transactions transaction
set benefit_scope = null
where transaction.type = 'expense'
  and (
    lower(trim(coalesce(transaction.category_name_snapshot, ''))) in ('receivables', 'piutang')
    or transaction.category_id in (
      select category.id
      from public.categories category
      left join public.categories parent on parent.id = category.parent_id
      where category.flow = 'expense'
        and category.archived_at is null
        and (
          category.normalized_name in ('receivables', 'piutang')
          or parent.normalized_name in ('receivables', 'piutang')
        )
    )
  );

create or replace function public.set_transaction_benefit_scope(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (p_payload ->> 'workspace_id')::uuid;
  v_transaction_id uuid := (p_payload ->> 'transaction_id')::uuid;
  v_scope text := nullif(trim(p_payload ->> 'benefit_scope'), '');
  v_transaction public.transactions;
begin
  perform private.require_workspace_role(v_workspace_id, array['owner', 'editor']::public.workspace_role[]);
  if v_scope is not null and v_scope not in ('self', 'shared', 'other') then
    raise exception 'Transaction benefit scope must be self, shared, or other';
  end if;

  select * into v_transaction
  from public.transactions
  where id = v_transaction_id and workspace_id = v_workspace_id
    and status = 'posted' and reversal_of_id is null
  for update;
  if not found then raise exception 'Posted transaction not found'; end if;
  if v_scope is not null and v_scope <> 'self' and v_transaction.type <> 'expense' then
    raise exception 'Only expenses may have a non-personal benefit scope';
  end if;

  perform set_config('firstfruit.internal_write', 'on', true);
  update public.transactions set benefit_scope = v_scope where id = v_transaction_id;
  return v_transaction_id;
end;
$$;

create or replace function public.post_transaction_with_benefit_scope(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_scope text := nullif(trim(p_payload ->> 'benefit_scope'), '');
begin
  if v_scope is not null and v_scope not in ('self', 'shared', 'other') then
    raise exception 'Transaction benefit scope must be self, shared, or other';
  end if;
  v_transaction_id := public.post_transaction(p_payload);
  if v_scope is not null then
    perform public.set_transaction_benefit_scope(
      jsonb_build_object(
        'workspace_id', p_payload ->> 'workspace_id',
        'transaction_id', v_transaction_id,
        'benefit_scope', v_scope
      )
    );
  end if;
  return v_transaction_id;
end;
$$;

create or replace function public.replace_transaction_with_benefit_scope(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_scope text := nullif(trim(p_payload ->> 'benefit_scope'), '');
begin
  if v_scope is not null and v_scope not in ('self', 'shared', 'other') then
    raise exception 'Transaction benefit scope must be self, shared, or other';
  end if;
  v_transaction_id := public.replace_transaction(p_payload - 'benefit_scope');
  if v_scope is not null then
    perform public.set_transaction_benefit_scope(
      jsonb_build_object(
        'workspace_id', p_payload ->> 'workspace_id',
        'transaction_id', v_transaction_id,
        'benefit_scope', v_scope
      )
    );
  end if;
  return v_transaction_id;
end;
$$;

commit;
