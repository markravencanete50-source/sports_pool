-- ============================================================================
-- A. CRITICAL — pool_transactions.platform_fee / net_amount are NOT NULL with
--    NO DEFAULT, but nothing ever supplies them.
--
-- src/lib/fulfill-card-purchase.ts inserts a pool_transactions row with only
-- (pool_id, user_id, card_id, amount, status, stripe_session_id, payment_id).
-- Its comment claims "trg_set_pool_transaction_fee now derives both from
-- platform_settings at insert time" and "the columns also default to 0, so the
-- insert is valid either way".
--
-- BOTH claims are false against the committed schema: no such trigger exists in
-- any migration, and 20260201000000_initial_schema.sql declares
--     platform_fee numeric not null,
--     net_amount   numeric not null,
-- with no default. On a database provisioned from these migrations the insert
-- therefore fails with 23502 (not-null violation). fulfillCardPurchase treats a
-- non-unique-violation error as fatal, deletes the just-created card, and
-- returns "Failed to record transaction" — so the player is CHARGED BY STRIPE
-- AND RECEIVES NO CARD, on every single purchase. The webhook logs
-- "FULFILMENT FAILED — MANUAL REVIEW REQUIRED" and ACKs, so Stripe never
-- retries.
--
-- Fix both halves properly:
--   1. Give the columns defaults so an insert that omits them is valid.
--   2. Create the trigger the code already documents, so the platform's cut is
--      actually RECORDED per sale (it was previously retained but written
--      nowhere, making every revenue figure read $0).
-- ============================================================================

alter table public.pool_transactions
  alter column platform_fee set default 0,
  alter column net_amount   set default 0;

-- Derive the fee from platform_settings at insert time, so every write path
-- records it without needing an extra round trip in the Stripe critical section.
create or replace function public.set_pool_transaction_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pct numeric;
begin
  select ps.platform_fee_percentage
    into v_pct
  from public.platform_settings ps
  order by ps.updated_at desc nulls last
  limit 1;

  v_pct := coalesce(v_pct, 10);

  -- Round to cents so the recorded fee reconciles exactly against the amount.
  new.platform_fee := round(coalesce(new.amount, 0) * v_pct / 100.0, 2);
  new.net_amount   := coalesce(new.amount, 0) - new.platform_fee;

  return new;
end;
$$;

drop trigger if exists trg_set_pool_transaction_fee on public.pool_transactions;
create trigger trg_set_pool_transaction_fee
  before insert on public.pool_transactions
  for each row execute function public.set_pool_transaction_fee();

-- ============================================================================
-- B. FEE LOCK — settlement used the CURRENT global fee percentage, not the one
--    in force when players actually bought in.
--
-- materializePoolWinners() read platform_settings at settlement time and
-- computePoolWinners() derived netPot = prize_pot * (1 - pct/100). If an admin
-- changed platform_fee_percentage between the first card sale and settlement,
-- the pot was split against a rate nobody was ever charged: raising the fee from
-- 10% to 20% mid-pool silently takes an extra 10% out of the players' pot, and
-- payouts stop reconciling against the recorded per-sale fees.
--
-- The fee a pool advertises must be fixed for that pool. Store it on the pool at
-- creation and settle against that value.
-- ============================================================================

alter table public.pools
  add column if not exists platform_fee_percentage numeric;

comment on column public.pools.platform_fee_percentage is
  'Platform fee %% locked in when the pool was created. Settlement MUST use this, not the live platform_settings value, so a later fee change cannot re-split an in-flight pool.';

-- Stamp the fee on every new pool regardless of which code path creates it
-- (user-created pools, the system weekly pool, seeds).
create or replace function public.set_pool_platform_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pct numeric;
begin
  if new.platform_fee_percentage is null then
    select ps.platform_fee_percentage
      into v_pct
    from public.platform_settings ps
    order by ps.updated_at desc nulls last
    limit 1;

    new.platform_fee_percentage := coalesce(v_pct, 10);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_pool_platform_fee on public.pools;
create trigger trg_set_pool_platform_fee
  before insert on public.pools
  for each row execute function public.set_pool_platform_fee();

-- Backfill existing pools with the current setting. This is behaviour
-- preserving: settlement already used the live value for these pools, so
-- stamping it now changes nothing except making it immutable from here on.
update public.pools p
set platform_fee_percentage = coalesce(
  (select ps.platform_fee_percentage
     from public.platform_settings ps
    order by ps.updated_at desc nulls last
    limit 1),
  10
)
where p.platform_fee_percentage is null;

-- These triggers run as the table owner; they must never be callable directly.
revoke all on function public.set_pool_transaction_fee() from anon, authenticated;
revoke all on function public.set_pool_platform_fee()    from anon, authenticated;
