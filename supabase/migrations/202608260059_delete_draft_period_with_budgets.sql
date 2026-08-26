begin;

-- Draft belum memiliki transaksi. Ia dapat dibatalkan beserta anggaran yang hanya
-- menjadi rancangan, tanpa membuka peluang menghapus periode aktif atau arsip.
create or replace function public.delete_draft_budget_period(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (p_payload ->> 'workspace_id')::uuid;
  v_period_id uuid := (p_payload ->> 'period_id')::uuid;
  v_key uuid := coalesce((p_payload ->> 'idempotency_key')::uuid, gen_random_uuid());
  v_existing_id uuid;
  v_is_new boolean;
begin
  perform private.require_workspace_role(
    v_workspace_id,
    array['owner', 'editor']::public.workspace_role[]
  );

  select result_entity_id, is_new
    into v_existing_id, v_is_new
  from private.claim_command(
    v_workspace_id,
    v_key,
    'delete_draft_budget_period',
    p_payload,
    v_period_id
  );
  if not v_is_new then
    return v_existing_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 0));

  if not exists (
    select 1
    from public.budget_periods
    where id = v_period_id
      and workspace_id = v_workspace_id
      and status = 'draft'
    for update
  ) then
    raise exception 'Draft periode tidak ditemukan';
  end if;

  if exists (
    select 1
    from public.transactions
    where workspace_id = v_workspace_id and period_id = v_period_id
  ) then
    raise exception 'Draft yang sudah memiliki transaksi tidak dapat dihapus';
  end if;

  delete from public.budgets
  where workspace_id = v_workspace_id and period_id = v_period_id;

  delete from public.budget_periods
  where id = v_period_id and workspace_id = v_workspace_id and status = 'draft';

  insert into public.audit_events (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    v_workspace_id,
    (select auth.uid()),
    'period.draft_deleted',
    'period',
    v_period_id,
    '{}'::jsonb
  );

  return v_period_id;
end;
$$;

revoke all on function public.delete_draft_budget_period(jsonb) from public;
grant execute on function public.delete_draft_budget_period(jsonb) to authenticated;

commit;
