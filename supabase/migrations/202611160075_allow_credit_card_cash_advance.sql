begin;

-- Tarik tunai (cash advance) kartu kredit dicatat sebagai `transfer` dari wallet
-- liability ke wallet asset. Jurnalnya: debit wallet asset, kredit wallet kartu,
-- sehingga saldo rekening naik dan utang kartu naik dengan nominal yang sama.
-- Kekayaan bersih tidak berubah. Limit kartu tetap dijaga apply_wallet_line.
-- Biaya tarik tunai adalah pengeluaran terpisah dari kartu yang sama.
do $migration$
declare
  v_definition text;
  v_updated text;
  v_anchor constant text := $anchor$
  elsif v_type = 'transfer' then
    if v_source_account is null or v_destination_account is null
       or v_source_wallet.wallet_class <> 'asset'
       or v_destination_wallet.wallet_class <> 'asset'
       or (v_source_wallet_id = v_destination_wallet_id and v_saving_id is null) then
      raise exception 'Transfer requires two distinct asset wallets unless reserving savings';
    end if;
    v_owed := 0;$anchor$;
  v_replacement constant text := $replacement$
  elsif v_type = 'transfer' then
    if v_source_account is not null and v_destination_account is not null
       and v_source_wallet.wallet_class = 'liability'
       and v_destination_wallet.wallet_class = 'asset' then
      -- Tarik tunai bukan belanja: tidak boleh merealisasikan anggaran.
      if v_budget_id is not null then
        raise exception 'Cash advance cannot be linked to a budget';
      end if;
      v_category_id := null;
      v_category_name := 'Tarik Tunai Kartu Kredit';
    elsif v_source_account is null or v_destination_account is null
       or v_source_wallet.wallet_class <> 'asset'
       or v_destination_wallet.wallet_class <> 'asset'
       or (v_source_wallet_id = v_destination_wallet_id and v_saving_id is null) then
      raise exception 'Transfer requires two distinct asset wallets, a saving reserve, or a credit-card cash advance to an asset wallet';
    end if;
    v_owed := 0;$replacement$;
begin
  select pg_get_functiondef('public.post_transaction(jsonb)'::regprocedure) into v_definition;
  -- Teks fungsi maupun file ini dapat ber-CRLF bila dipush dari Windows.
  v_definition := replace(v_definition, chr(13), '');
  v_updated := replace(
    v_definition,
    replace(v_anchor, chr(13), ''),
    replace(v_replacement, chr(13), '')
  );
  if v_updated = v_definition then
    raise exception 'Unable to allow credit-card cash advance in post_transaction';
  end if;
  execute v_updated || ';';
end;
$migration$;

-- Saldo kartu yang diharapkan = tagihan lalu + belanja + tarik tunai − pembayaran.
-- Tanpa tarik tunai, rekonsiliasi sebelum pembayaran akan menghapusnya dari utang.
create or replace function private.credit_card_expected_balance(
  p_workspace_id uuid,
  p_wallet_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_open_period_id uuid;
  v_previous_bill bigint;
  v_charges bigint;
  v_payments bigint;
begin
  select p.id into v_open_period_id
  from public.budget_periods p
  where p.workspace_id = p_workspace_id and p.status = 'open';

  select w.previous_period_bill_minor into v_previous_bill
  from public.wallets w
  where w.workspace_id = p_workspace_id
    and w.id = p_wallet_id
    and w.wallet_class = 'liability'
    and w.archived_at is null;

  if v_previous_bill is null then
    raise exception 'Credit-card wallet is unavailable';
  end if;
  if v_open_period_id is null then
    raise exception 'Workspace has no open period';
  end if;

  select
    coalesce(sum(t.amount_minor) filter (
      where t.type in ('expense', 'transfer') and t.wallet_id = p_wallet_id
    ), 0),
    coalesce(sum(t.amount_minor) filter (
      where t.type = 'credit_payment' and t.to_wallet_id = p_wallet_id
    ), 0)
  into v_charges, v_payments
  from public.v_transactions t
  where t.workspace_id = p_workspace_id
    and t.period_id = v_open_period_id;

  return greatest(0, v_previous_bill + v_charges - v_payments);
end;
$$;

revoke all on function private.credit_card_expected_balance(uuid, uuid) from public;

commit;
