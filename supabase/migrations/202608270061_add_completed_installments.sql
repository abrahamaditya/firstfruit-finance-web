begin;

-- Saat cicilan lama baru dicatat di aplikasi, beberapa angsuran mungkin sudah dibayar.
-- Simpan jumlahnya bersama tenor agar sisa cicilan selalu dapat dihitung secara akurat.
alter table public.transaction_installments
  add column completed_installments smallint not null default 0,
  add constraint transaction_installments_completed_range
    check (completed_installments >= 0 and completed_installments < tenor_months);

-- Validasi tetap berada di jalur posting atomik, sehingga client lain tidak dapat
-- menyimpan jumlah cicilan lunas yang negatif atau sudah mencapai seluruh tenor.
do $migration$
declare
  v_definition text;
  v_updated text;
  v_anchor constant text :=
    '    insert into public.transaction_installments'
      || chr(10)
      || '      (transaction_id, workspace_id, tenor_months)'
      || chr(10)
      || '    values ('
      || chr(10)
      || '      v_transaction_id, v_workspace_id,'
      || chr(10)
      || '      (p_payload ->> ''installment_tenor_months'')::smallint'
      || chr(10)
      || '    );';
  v_replacement constant text :=
    '    if coalesce(nullif(p_payload ->> ''installment_paid_months'', '''')::integer, 0)'
      || chr(10)
      || '      not between 0 and (p_payload ->> ''installment_tenor_months'')::integer - 1 then'
      || chr(10)
      || '      raise exception ''Completed installments must be at least zero and lower than the tenor'';'
      || chr(10)
      || '    end if;'
      || chr(10)
      || '    insert into public.transaction_installments'
      || chr(10)
      || '      (transaction_id, workspace_id, tenor_months, completed_installments)'
      || chr(10)
      || '    values ('
      || chr(10)
      || '      v_transaction_id, v_workspace_id,'
      || chr(10)
      || '      (p_payload ->> ''installment_tenor_months'')::smallint,'
      || chr(10)
      || '      coalesce(nullif(p_payload ->> ''installment_paid_months'', '''')::smallint, 0)'
      || chr(10)
      || '    );';
begin
  select pg_get_functiondef('public.post_transaction(jsonb)'::regprocedure)
    into v_definition;

  v_updated := replace(v_definition, v_anchor, v_replacement);
  if v_updated = v_definition then
    raise exception 'Unable to add completed-installment metadata to post_transaction';
  end if;

  execute v_updated || ';';
end;
$migration$;

create or replace view public.v_transactions
with (security_invoker = true)
as
select
  t.id, t.workspace_id, t.type, t.status, t.nature, t.amount_minor, t.currency_code,
  t.occurred_at, t.period_id, t.category_id,
  coalesce(t.category_name_snapshot, c.name) as category_name,
  t.merchant, t.recipient, t.owed_amount_minor, t.subscription_id, t.split_bill_id,
  t.note, t.reversal_of_id, t.replaced_by_id, t.created_by, t.created_at,
  (max(la.wallet_id::text) filter (where
    (t.type in ('expense', 'transfer', 'credit_payment') and tl.side = 'credit')
    or (t.type = 'income' and tl.side = 'debit')
    or (t.type = 'adjustment' and la.wallet_id is not null)
  ))::uuid as wallet_id,
  (max(la.wallet_id::text) filter (where t.type in ('transfer', 'credit_payment') and tl.side = 'debit'))::uuid as to_wallet_id,
  max(tba.budget_id::text)::uuid as budget_id,
  (max(rp.receivable_id::text) filter (where rp.reversed_at is null))::uuid as settles_receivable_id,
  max(sm.saving_id::text)::uuid as saving_id,
  max(case
    when t.type = 'adjustment' and w.wallet_class = 'asset' and tl.side = 'debit' then 'increase'
    when t.type = 'adjustment' and w.wallet_class = 'liability' and tl.side = 'credit' then 'increase'
    when t.type = 'adjustment' and w.id is not null then 'decrease'
    else null
  end) as adjustment_effect,
  max(ti.tenor_months)::smallint as installment_tenor_months,
  t.benefit_scope,
  max(ti.completed_installments)::smallint as installment_paid_months
from public.transactions t
left join public.categories c on c.id = t.category_id
left join public.transaction_lines tl on tl.transaction_id = t.id
left join public.ledger_accounts la on la.id = tl.ledger_account_id
left join public.wallets w on w.id = la.wallet_id and w.workspace_id = t.workspace_id
left join public.transaction_budget_allocations tba on tba.transaction_id = t.id
left join public.receivable_payments rp on rp.transaction_id = t.id
left join public.saving_movements sm on sm.transaction_id = t.id
left join public.transaction_installments ti on ti.transaction_id = t.id
where t.status = 'posted' and t.reversal_of_id is null and t.visible_in_feed
group by t.id, c.name;

grant select on public.v_transactions to authenticated;

commit;
