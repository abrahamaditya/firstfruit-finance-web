begin;

-- Angsuran dibulatkan ke bawah dan sisa pembulatan Rp1 masuk ke angsuran paling akhir,
-- sama seperti tagihan bank (BCA). Contoh 799.000 / 3 = 266.333, 266.333, 266.334.
-- Nominal transaksi = angsuran pertama yang belum lunas (installment_paid_months + 1).
do $migration$
declare
  v_definition text;
  v_updated text;
  v_anchor constant text := $anchor$
      if coalesce(nullif(p_payload ->> 'installment_pricing_mode', ''), 'monthly') = 'item_total'
         and v_amount <> (
           (p_payload ->> 'installment_item_total_minor')::bigint
           + coalesce(nullif(p_payload ->> 'installment_interest_total_minor', '')::bigint, 0)
           + (p_payload ->> 'installment_tenor_months')::bigint - 1
         ) / (p_payload ->> 'installment_tenor_months')::bigint then$anchor$;
  v_replacement constant text := $replacement$
      if coalesce(nullif(p_payload ->> 'installment_pricing_mode', ''), 'monthly') = 'item_total'
         and v_amount <> (
           (p_payload ->> 'installment_item_total_minor')::bigint
           + coalesce(nullif(p_payload ->> 'installment_interest_total_minor', '')::bigint, 0)
         ) / (p_payload ->> 'installment_tenor_months')::bigint
         -- Dibungkus kurung: kondisi IF PL/pgSQL berhenti di THEN pertama di luar kurung.
         + (case
             when coalesce(nullif(p_payload ->> 'installment_paid_months', '')::bigint, 0) + 1
               > (p_payload ->> 'installment_tenor_months')::bigint - (
                 (p_payload ->> 'installment_item_total_minor')::bigint
                 + coalesce(nullif(p_payload ->> 'installment_interest_total_minor', '')::bigint, 0)
               ) % (p_payload ->> 'installment_tenor_months')::bigint
             then 1 else 0
           end) then$replacement$;
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
    raise exception 'Unable to round installment amount down in post_transaction';
  end if;
  execute v_updated || ';';
end;
$migration$;

-- Alokasi pembayaran kartu mengikuti pembagian yang sama: Rp1 sisa di angsuran terakhir.
do $migration$
declare
  v_definition text;
  v_updated text;
  v_anchor constant text := $anchor$
    v_amount_minor := v_installments_paid * v_base
      + least(v_extra, v_start + v_installments_paid) - least(v_extra, v_start);$anchor$;
  v_replacement constant text := $replacement$
    v_amount_minor := v_installments_paid * v_base
      + greatest(0, v_start + v_installments_paid - (v_tenor - v_extra))
      - greatest(0, v_start - (v_tenor - v_extra));$replacement$;
begin
  select pg_get_functiondef('private.allocate_credit_payment_installments(uuid, uuid, uuid, bigint, jsonb)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_updated := replace(
    v_definition,
    replace(v_anchor, chr(13), ''),
    replace(v_replacement, chr(13), '')
  );
  if v_updated = v_definition then
    raise exception 'Unable to move installment rounding to the last allocation';
  end if;
  execute v_updated || ';';
end;
$migration$;

commit;
