begin;

-- Tagihan periode sebelumnya adalah angka pembuka yang dikonfirmasi pengguna,
-- bukan hasil membalik transaksi periode berjalan dari saldo kartu hari ini.
alter table public.wallets
  add column previous_period_bill_minor bigint not null default 0,
  add constraint wallets_previous_period_bill_nonnegative
    check (previous_period_bill_minor >= 0);

-- Untuk kartu yang sudah ada, nilai tagihan yang sebelumnya diisi lewat form
-- tersimpan sebagai saldo kartu saat ini. Jadikan nilai itu baseline tetap agar
-- tampilan tidak lagi berubah ketika transaksi periode aktif bertambah/berkurang.
update public.wallets
set previous_period_bill_minor = current_balance_minor
where wallet_class = 'liability';

create or replace function public.create_wallet_with_network(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (p_payload ->> 'workspace_id')::uuid;
  v_wallet_id uuid;
  v_card_network text := nullif(trim(p_payload ->> 'card_network'), '');
  v_previous_bill bigint := coalesce(
    nullif(p_payload ->> 'previous_period_bill_minor', '')::bigint,
    case when p_payload ->> 'wallet_class' = 'liability'
      then coalesce(nullif(p_payload ->> 'opening_balance_minor', '')::bigint, 0)
      else 0
    end
  );
begin
  perform private.require_workspace_role(
    v_workspace_id,
    array['owner', 'editor']::public.workspace_role[]
  );
  if v_previous_bill < 0 then
    raise exception 'Previous credit-card bill cannot be negative';
  end if;

  v_wallet_id := public.create_wallet(p_payload);

  update public.wallets
  set card_network = v_card_network,
      previous_period_bill_minor = case
        when wallet_class = 'liability' then v_previous_bill
        else 0
      end
  where id = v_wallet_id
    and workspace_id = v_workspace_id;

  return v_wallet_id;
end;
$$;

create or replace function public.update_wallet_with_network(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := (p_payload ->> 'workspace_id')::uuid;
  v_wallet_id uuid;
  v_previous_bill bigint;
  v_wallet_class public.wallet_class;
begin
  perform private.require_workspace_role(
    v_workspace_id,
    array['owner', 'editor']::public.workspace_role[]
  );

  v_wallet_id := public.update_wallet(p_payload);

  if p_payload ? 'previous_period_bill_minor' then
    v_previous_bill := coalesce(
      nullif(p_payload ->> 'previous_period_bill_minor', '')::bigint,
      0
    );
    if v_previous_bill < 0 then
      raise exception 'Previous credit-card bill cannot be negative';
    end if;

    select wallet_class into v_wallet_class
    from public.wallets
    where id = v_wallet_id and workspace_id = v_workspace_id
    for update;
    if v_wallet_class <> 'liability' then
      raise exception 'Previous credit-card bill is only available for credit cards';
    end if;

    update public.wallets
    set previous_period_bill_minor = v_previous_bill
    where id = v_wallet_id and workspace_id = v_workspace_id;
  end if;

  if p_payload ? 'card_network' then
    update public.wallets
    set card_network = nullif(trim(p_payload ->> 'card_network'), '')
    where id = v_wallet_id
      and workspace_id = v_workspace_id;
  end if;

  return v_wallet_id;
end;
$$;

revoke all on function public.create_wallet_with_network(jsonb) from public;
revoke all on function public.update_wallet_with_network(jsonb) from public;
grant execute on function public.create_wallet_with_network(jsonb) to authenticated;
grant execute on function public.update_wallet_with_network(jsonb) to authenticated;

commit;
