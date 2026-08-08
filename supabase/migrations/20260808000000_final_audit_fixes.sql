-- ============================================================================
-- FINAL AUDIT FIXES
-- Each section closes a finding confirmed against the code in the last pass.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. CRITICAL — a client-supplied platform fee could MINT prize money
-- ---------------------------------------------------------------------------
-- 20260807000001 added pools.platform_fee_percentage and a trigger that only
-- stamped it `if new.platform_fee_percentage is null`. Two facts make that
-- exploitable:
--
--   * `authenticated` still holds INSERT on public.pools (20260806000000 only
--     revoked UPDATE and revoked anon's writes), and the INSERT policy is
--     `with check (auth.uid() = created_by)` — it constrains WHO, never WHICH
--     COLUMNS.
--   * Settlement computes netPot = prize_pot * (1 - pct/100) with no clamp.
--
-- So a direct PostgREST insert of {created_by: self, platform_fee_percentage: -100}
-- creates a pool whose settlement pays 2x the pot — money the platform never
-- took. -900 pays 10x. This is a payout-inflation primitive, not a fee dodge.
--
-- Fix at both ends: the trigger now stamps UNCONDITIONALLY on insert (any client
-- value is discarded), and a CHECK makes an out-of-range value impossible even
-- if some future code path writes the column directly.
create or replace function public.set_pool_platform_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pct numeric;
begin
  -- Unconditional: never trust an incoming value for this column.
  select ps.platform_fee_percentage
    into v_pct
  from public.platform_settings ps
  order by ps.updated_at desc nulls last
  limit 1;

  new.platform_fee_percentage := least(greatest(coalesce(v_pct, 10), 0), 100);

  return new;
end;
$$;

drop trigger if exists trg_set_pool_platform_fee on public.pools;
create trigger trg_set_pool_platform_fee
  before insert on public.pools
  for each row execute function public.set_pool_platform_fee();

-- Repair anything already stored outside the valid range before constraining.
update public.pools
   set platform_fee_percentage = 10
 where platform_fee_percentage is null
    or platform_fee_percentage < 0
    or platform_fee_percentage > 100;

alter table public.pools
  drop constraint if exists pools_platform_fee_percentage_range;
alter table public.pools
  add constraint pools_platform_fee_percentage_range
  check (platform_fee_percentage is null
         or (platform_fee_percentage >= 0 and platform_fee_percentage <= 100));


-- ---------------------------------------------------------------------------
-- 2. Recorded per-sale fee must match the fee the pool actually settles at
-- ---------------------------------------------------------------------------
-- trg_set_pool_transaction_fee read the LIVE global rate. Since settlement uses
-- the pool's locked rate, a mid-season change made recorded revenue disagree
-- with the actual split. Prefer the pool's locked rate; fall back to global.
create or replace function public.set_pool_transaction_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pct numeric;
begin
  select p.platform_fee_percentage
    into v_pct
  from public.pools p
  where p.id = new.pool_id;

  if v_pct is null then
    select ps.platform_fee_percentage
      into v_pct
    from public.platform_settings ps
    order by ps.updated_at desc nulls last
    limit 1;
  end if;

  v_pct := least(greatest(coalesce(v_pct, 10), 0), 100);

  new.platform_fee := round(coalesce(new.amount, 0) * v_pct / 100.0, 2);
  new.net_amount   := coalesce(new.amount, 0) - new.platform_fee;

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. HIGH — self-issued invitation unlocks any private pool
-- ---------------------------------------------------------------------------
-- 20260804000000 tightened pool_participants so a user could not self-join a
-- private pool: the insert requires the pool to be public OR an ACCEPTED
-- invitation to exist. But pool_invitations kept its original policy:
--
--     for insert with check (auth.uid() = invited_by)
--
-- which constrains only who claims to have sent it. Any user could insert
-- {pool_id: <any private pool>, invited_by: self, invited_user_id: self},
-- accept it, and satisfy the participants check — reopening exactly the hole
-- that was just closed, one step later.
--
-- Only the pool owner may invite, and never themselves.
drop policy if exists "Users can create invitations" on public.pool_invitations;
drop policy if exists "Pool owner invites only"      on public.pool_invitations;

create policy "Pool owner invites only" on public.pool_invitations
  for insert with check (
    auth.uid() = invited_by
    and invited_user_id <> auth.uid()
    and exists (
      select 1 from public.pools p
      where p.id = pool_id
        and p.created_by = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 4. HIGH — newsletter_subscribers is written by an API route but exists in no
--            migration, so /api/newsletter/subscribe fails on a rebuilt database
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

-- Anyone may subscribe; nobody may read the list back (it is a marketing PII
-- list). The route only ever inserts, and relies on the unique violation to
-- report "already subscribed".
drop policy if exists "Anyone can subscribe" on public.newsletter_subscribers;
create policy "Anyone can subscribe" on public.newsletter_subscribers
  for insert with check (true);

revoke select, update, delete on public.newsletter_subscribers from anon, authenticated;
grant insert on public.newsletter_subscribers to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. MEDIUM — reference data was writable by any authenticated user
-- ---------------------------------------------------------------------------
-- games was locked to admins in 20260804000000, but teams kept its original
-- open policies. Team rows are referenced by every game, so letting any account
-- rewrite them is a data-integrity hole with no legitimate use.
drop policy if exists "Authenticated users can insert teams" on public.teams;
drop policy if exists "Authenticated users can update teams" on public.teams;

create policy "Only admins can insert teams" on public.teams
  for insert with check (public.is_admin());
create policy "Only admins can update teams" on public.teams
  for update using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- 6. MEDIUM — a demoted admin kept database-level admin until their JWT expired
-- ---------------------------------------------------------------------------
-- is_admin() coalesced the JWT app_metadata claim FIRST, so revoking a role in
-- public.users had no effect on RLS until the token rolled over (up to an hour).
-- Make the table authoritative; the claim is only a fallback for the window
-- before a profile row exists.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.role = 'admin' from public.users u where u.id = auth.uid()),
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;


-- ---------------------------------------------------------------------------
-- 6b. HIGH — every other player's name rendered as "Unknown"
-- ---------------------------------------------------------------------------
-- Locking public.users down to own-row SELECT (correct: it carries email, role
-- and balance) silently broke every display-name join. The API embeds
-- `users(id, name, avatar)` for chat authors, pool participants and pool
-- creators; under the new policy those embedded rows resolve to NULL for anyone
-- but the caller, so the UI shows "Unknown" for every other player.
--
-- public.profiles exists precisely for this — a world-readable projection of
-- (id, name, avatar) — but nothing was ever pointed at it, because PostgREST
-- can only embed across a foreign key and none of these tables referenced it.
--
-- Add those foreign keys. profiles.id already references users(id) and was
-- backfilled from it, so every existing row satisfies them. A column may carry
-- more than one FK; the routes disambiguate with the constraint name as an
-- embed hint, e.g. profiles!comments_user_id_profiles_fkey(id, name, avatar).
alter table public.comments
  drop constraint if exists comments_user_id_profiles_fkey;
alter table public.comments
  add constraint comments_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.pool_participants
  drop constraint if exists pool_participants_user_id_profiles_fkey;
alter table public.pool_participants
  add constraint pool_participants_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.pools
  drop constraint if exists pools_created_by_profiles_fkey;
alter table public.pools
  add constraint pools_created_by_profiles_fkey
  foreign key (created_by) references public.profiles(id) on delete cascade;


-- ---------------------------------------------------------------------------
-- 6c. CRITICAL — a card could be activated AFTER the pool had been settled
-- ---------------------------------------------------------------------------
-- "Card editable while pending" allowed pending -> active with no condition on
-- the pool's status:
--
--   using      (user_id = auth.uid() and status = 'pending')
--   with check (user_id = auth.uid() and status in ('pending', 'active'))
--
-- The pool-completed check lived only in /cards/[cardId]/lock, which a direct
-- PATCH to /rest/v1/parlay_cards bypasses entirely. Combined with the
-- re-materialisation path that used to exist on the winnings page, a player
-- could fill in every pick, deliberately NOT lock the card, wait for the real
-- results, then activate it and have the pool re-scored with the outcomes
-- known — paying the pot a second time.
--
-- Scoring only ever considers 'active'/'completed' cards, so a card must not be
-- able to enter that set once its pool has stopped accepting play.
drop policy if exists "Card editable while pending" on public.parlay_cards;
create policy "Card editable while pending" on public.parlay_cards
  for update
  using (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.pools p
      where p.id = pool_id and p.status in ('open', 'active')
    )
  )
  with check (
    user_id = auth.uid()
    and status in ('pending', 'active')
    and exists (
      select 1 from public.pools p
      where p.id = pool_id and p.status in ('open', 'active')
    )
  );


-- ---------------------------------------------------------------------------
-- 7. LOW — pool_winners was directly readable by anon for completed pools
-- ---------------------------------------------------------------------------
-- The public ticker now goes through get_public_winners(), which returns a
-- minimal projection and no user identifiers. The direct-read policy predates
-- it and additionally exposed private-pool results and user UUIDs.
drop policy if exists "Anyone can view pool winners for completed pools (ticker)"
  on public.pool_winners;
revoke select on public.pool_winners from anon;
