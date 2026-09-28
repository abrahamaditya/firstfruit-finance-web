begin;

do $migration$
declare
  v_definition text;
  v_updated text;
  v_anchor constant text := $anchor$    if not found then
      raise exception 'Selected installment is unavailable for this credit card';
    end if;$anchor$;
  v_replacement constant text := $replacement$    if not found then
      raise exception 'Selected installment is unavailable for this credit card';
    end if;
    if v_monthly_amount <= 0 then
      raise exception 'Recorded monthly installment amount must be positive';
    end if;$replacement$;
begin
  select pg_get_functiondef('private.allocate_credit_payment_installments(uuid, uuid, uuid, bigint, jsonb)'::regprocedure)
    into v_definition;
  v_updated := replace(v_definition, v_anchor, v_replacement);
  if v_updated = v_definition then
    raise exception 'Unable to add positive-monthly-amount validation';
  end if;
  execute v_updated || ';';
end;
$migration$;

commit;
