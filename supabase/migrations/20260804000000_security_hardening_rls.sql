-- ============================================================================
-- SECURITY HARDENING — corrective RLS
--
-- Derived from an adversarially-verified audit of the pre-launch codebase.
-- The production database is being REBUILT from scratch, so treat this file as
-- the required policy set for the new schema, not merely as a patch. Every
-- statement here fixes a confirmed, exploitable finding.
--
-- Guiding rule for a real-money product: the database must be the authorization
-- boundary. An API bug must not be sufficient to leak or move money, because
-- every finding below was an API layer that looked correct until RLS was asked
-- to back it up and didn't.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. games — ANY authenticated user could rewrite a final score  [CRITICAL]
--
-- Shipped policy:
--   create policy "Authenticated users can update games" on public.games
--       for update using (auth.uid() is not null);
--
-- A game's final score settles every pool containing it, so this let any
-- registered account choose who won the pot. Insert had the same flaw.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can update games" on public.games;
drop policy if exists "Authenticated users can insert games" on public.games;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    (select u.role = 'admin' from public.users u where u.id = auth.uid()),
    false
  );
$$;

create policy "Only admins can insert games" on public.games
  for insert with check (public.is_admin());

create policy "Only admins can update games" on public.games
  for update using (public.is_admin()) with check (public.is_admin());

-- Scores must never be negative regardless of who writes them.
alter table public.games
  drop constraint if exists games_scores_non_negative;
alter table public.games
  add constraint games_scores_non_negative
  check (
    (home_score is null or home_score >= 0) and
    (away_score is null or away_score >= 0)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. users — world-readable table containing email, role AND balance  [HIGH]
--
-- Shipped policy:
--   create policy "Users can view all profiles" on public.users
--       for select using (true);
--
-- No auth.uid() predicate, so it applied to the anon role too. With the public
-- anon key (present in every JS bundle) an unauthenticated client could page
-- the whole table: the full customer email list for a gambling product, each
-- account's cash balance, and which accounts are role='admin'.
--
-- The balance column was added nine migrations later without revisiting this.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Users can view all profiles" on public.users;

create policy "Users can view their own profile" on public.users
  for select using (auth.uid() = id);

create policy "Admins can view all profiles" on public.users
  for select using (public.is_admin());

-- Display-only projection for the joins that legitimately need a name next to a
-- comment or a participant row. Never expose email / balance / role through it.
create or replace view public.public_profiles
with (security_invoker = off) as
  select id, name, avatar from public.users;

grant select on public.public_profiles to anon, authenticated;

-- A user must not be able to promote themselves or edit their own balance.
-- (Balance is moved only by service-role code paths.)
drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role     is not distinct from (select u.role    from public.users u where u.id = auth.uid())
    and balance  is not distinct from (select u.balance from public.users u where u.id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pool_participants — self-join into any PRIVATE pool  [MEDIUM]
--
-- Shipped policy constrained only WHO the row was for, never WHICH pool:
--   for insert with check (auth.uid() = user_id);
--
-- Inserting {pool_id: <any private pool>, user_id: self} satisfied
-- is_pool_participant(), which unlocked the pool, its games, its chat and the
-- ability to buy a card in someone else's private pool.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Users can join pools" on public.pool_participants;

create policy "Users can join pools they are entitled to" on public.pool_participants
  for insert with check (
    auth.uid() = user_id
    and (
      exists (select 1 from public.pools p
              where p.id = pool_id and p.type = 'public')
      or exists (select 1 from public.pool_invitations i
                 where i.pool_id = pool_id
                   and i.invited_user_id = auth.uid()
                   and i.status = 'accepted')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CARD PRIVACY — the product's hardest requirement
--
-- No user, INCLUDING the pool owner, may read another user's card or picks.
-- Deny by default, then grant exactly one path: the holder.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.parlay_cards enable row level security;
alter table public.card_picks   enable row level security;

-- CRITICAL: Postgres RLS policies are PERMISSIVE and OR'd together, so a single
-- loose policy defeats every strict one beside it. The initial schema shipped:
--
--   create policy "Users can view picks in pools they participate in"
--     on public.card_picks for select using (
--       exists (select 1 from public.parlay_cards pc
--               join public.parlay_cards pc2 on pc.pool_id = pc2.pool_id
--               where pc.id = card_picks.card_id and pc2.user_id = auth.uid()));
--
-- Owning ANY card in the pool satisfies pc2, so that predicate returns every
-- pick row in the pool. Buying one entry bought you every opponent's full
-- parlay and tiebreaker before kickoff — readable straight from the public REST
-- endpoint with the anon key that ships in the browser bundle.
--
-- Drop every pre-existing SELECT policy on these two tables before creating the
-- single correct one. Treat any second SELECT policy here as a defect forever.
drop policy if exists "Users can view picks in pools they participate in" on public.card_picks;
drop policy if exists "Users can view picks for own cards"                on public.card_picks;
drop policy if exists "Cards are viewable by pool participants" on public.parlay_cards;
drop policy if exists "Users can view own cards"                on public.parlay_cards;

create policy "Card holder only" on public.parlay_cards
  for select using (auth.uid() = user_id);

create policy "Card picks holder only" on public.card_picks
  for select using (
    exists (select 1 from public.parlay_cards c
            where c.id = card_picks.card_id and c.user_id = auth.uid())
  );

-- Picks may only be written while the card is unlocked AND the game has not
-- kicked off. Without this a card can be completed after results are known.
create policy "Card picks writable before kickoff" on public.card_picks
  for insert with check (
    exists (select 1 from public.parlay_cards c
            where c.id = card_picks.card_id
              and c.user_id = auth.uid()
              and c.status = 'pending')
    and exists (select 1 from public.games g
                where g.id = card_picks.game_id
                  and g.date > now()
                  and g.status = 'scheduled')
  );

create policy "Card picks updatable before kickoff" on public.card_picks
  for update using (
    exists (select 1 from public.parlay_cards c
            where c.id = card_picks.card_id
              and c.user_id = auth.uid()
              and c.status = 'pending')
    and exists (select 1 from public.games g
                where g.id = card_picks.game_id
                  and g.date > now()
                  and g.status = 'scheduled')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. MONEY — balances and payouts are owner-read, service-role-write
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.pool_transactions enable row level security;
alter table public.payout_requests   enable row level security;

drop policy if exists "Transactions viewable by owner" on public.pool_transactions;
drop policy if exists "Users can view own transactions" on public.pool_transactions;
create policy "Own transactions only" on public.pool_transactions
  for select using (auth.uid() = user_id or public.is_admin());

-- CRITICAL: the initial schema shipped
--
--   create policy "Users can create own transactions" on public.pool_transactions
--       for insert with check (auth.uid() = user_id);
--
-- The predicate constrains only WHOSE row it is — not the amount, not the
-- status, and not whether any money actually changed hands. Any authenticated
-- user could POST straight to /rest/v1/pool_transactions with the anon key from
-- the browser bundle and insert {amount: 100000, status: 'completed'}, which
-- feeds the pot calculation directly. No API route involved, so none of the
-- server-side payment checks applied.
drop policy if exists "Users can create own transactions" on public.pool_transactions;

-- No client-side INSERT/UPDATE at all: money rows are written exclusively by
-- service-role code (the Stripe webhook, payout approval). With every
-- permissive policy dropped, RLS denies by default for anon/authenticated.

create policy "Own payout requests" on public.payout_requests
  for select using (auth.uid() = user_id or public.is_admin());

create policy "Request own payout" on public.payout_requests
  for insert with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Stripe idempotency — REQUIRED by src/lib/fulfill-card-purchase.ts
--
-- The webhook and the return-page confirm path can race. Both do a pre-insert
-- lookup, but only this constraint closes the window in which both pass that
-- lookup and issue two cards for a single payment.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.pool_transactions
  drop constraint if exists pool_transactions_stripe_session_id_key;
alter table public.pool_transactions
  add constraint pool_transactions_stripe_session_id_key
  unique (stripe_session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6b. ATOMIC BALANCE DEBIT — required by the payout-approval route
--
-- The admin payout route called PayPal FIRST and checked the balance
-- afterwards, so N concurrent approvals each sent real money before any of them
-- verified funds. Even reordering is not enough: a read-then-write in
-- application code is a TOCTOU race. Settlement must be one statement.
--
-- Returns the new balance, or NULL when funds are insufficient. The caller
-- must treat NULL as "do not send money".
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.debit_user_balance(
  p_user_id uuid,
  p_amount  numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'debit amount must be positive';
  end if;

  -- Single atomic statement: the WHERE clause re-checks sufficiency against the
  -- row being written, so concurrent callers serialise on the row lock and only
  -- one can take the last of the funds.
  update public.users
     set balance = balance - p_amount
   where id = p_user_id
     and balance >= p_amount
  returning balance into v_new;

  return v_new;  -- NULL when no row matched (insufficient funds)
end;
$$;

create or replace function public.credit_user_balance(
  p_user_id uuid,
  p_amount  numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  update public.users
     set balance = balance + p_amount
   where id = p_user_id
  returning balance into v_new;

  return v_new;
end;
$$;

-- Only the service role may move money. Never expose these to the client.
revoke all on function public.debit_user_balance(uuid, numeric)  from anon, authenticated;
revoke all on function public.credit_user_balance(uuid, numeric) from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Legacy picks table — user-attributed predictions readable by others
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Picks are viewable by pool participants" on public.picks;
create policy "Own picks only" on public.picks
  for select using (auth.uid() = user_id);
