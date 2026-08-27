begin;

-- Pembayaran kartu adalah settlement liabilitas, bukan pengeluaran baru. Simpan label
-- sistem sebagai snapshot (tanpa kategori/anggaran) supaya tetap tampak dan bisa dicari
-- di riwayat transaksi, baik dari UI maupun pemanggil RPC lain.
do $migration$
declare
  v_definition text;
  v_updated text;
  v_anchor constant text :=
    '  perform set_config(''firstfruit.internal_write'', ''on'', true);';
  v_tag_block constant text :=
    '  if v_type = ''credit_payment'' then'
      || chr(10)
      || '    v_category_id := null;'
      || chr(10)
      || '    v_category_name := ''Pembayaran Tagihan'';'
      || chr(10)
      || '  end if;'
      || chr(10)
      || chr(10);
begin
  select pg_get_functiondef('public.post_transaction(jsonb)'::regprocedure)
    into v_definition;

  v_updated := replace(v_definition, v_anchor, v_tag_block || v_anchor);
  if v_updated = v_definition then
    raise exception 'Unable to add credit-payment transaction tag';
  end if;

  execute v_updated || ';';
end;
$migration$;

-- Riwayat pelunasan kartu menerima tag yang sama tanpa menyentuh jurnalnya.
select set_config('firstfruit.internal_write', 'on', true);

update public.transactions
set category_id = null,
    category_name_snapshot = 'Pembayaran Tagihan'
where type = 'credit_payment'
  and (
    category_id is not null
    or category_name_snapshot is distinct from 'Pembayaran Tagihan'
  );

commit;
