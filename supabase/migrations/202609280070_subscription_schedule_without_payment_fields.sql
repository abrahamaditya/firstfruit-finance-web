-- A subscription is a billing schedule and reminder, not a payment transaction.
-- Keep historical links intact while allowing new schedules without a wallet
-- or expense category.
alter table public.subscriptions
  alter column wallet_id drop not null,
  alter column category_id drop not null;
