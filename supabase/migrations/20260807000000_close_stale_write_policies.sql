/*
 * ============================================================================
 * CLOSE THE STALE WRITE POLICIES
 *
 * Every prior hardening pass wrote NEW strict policies. None of them removed
 * the ORIGINAL loose ones. Postgres ORs permissive policies together, so a
 * strict policy sitting beside a loose one grants exactly what the loose one
 * grants. The kickoff lock on card_picks, the private-pool fix, the slate
 * freeze — all of them are currently decorative for that reason.
 *
 * So this file is mostly DROP and REVOKE. Where a new policy appears it is
 * because the old one had to be replaced, not because a new grant is wanted.
 *
 * ── DRIFT CAVEAT ────────────────────────────────────────────────────────────
 * Production is NOT the migration set. schema.sql (repo root) is a dump of the
 * pre-hardening live database and shows policies that exist in no migration at
 * all — "Users can create own cards" on parlay_cards, "Users can create picks
 * for own cards" on card_picks, duplicate SELECT policies on pool_games,
 * card_picks and notifications. Names invented by hand in the dashboard cannot
 * be predicted, so this file:
 *   * drops every alias a stale policy is known to appear under, in any file;
 *   * re-drops names that earlier migrations claim to have dropped, in case
 *     those migrations were applied partially or by hand;
 *   * ends with a two-sided invariant over EVERY command on EVERY money and
 *     game-integrity table. Unexpected policy => exception and full rollback.
 *     Missing expected policy => warning, because a missing policy denies
 *     access rather than granting it.
 *
 * Safe to run once; harmless to run twice. Everything is `if exists` /
 * `if not exists`, every CHECK is added NOT VALID so legacy rows cannot abort
 * it, and the two index creations that could collide with existing data are
 * wrapped in exception handlers.
 *
 * ── OPERATOR NOTE — routes that this migration WILL break ───────────────────
 * The audit that produced this file assumed all pools/pool_games writes had
 * already moved to the service role. Reading the tree says otherwise:
 *
 *   src/app/api/pools/route.ts            pools + pool_games INSERT  -> admin  OK
 *   src/app/api/pools/[poolId]/route.ts   pool_games DELETE + INSERT -> USER CLIENT
 *   src/app/api/sync/nfl-games/route.ts   pools + pool_games INSERT  -> USER CLIENT
 *                                         (admin-gated by requireAdmin)
 *
 * Because of that, sections 2 and 7 make pools/pool_games writes ADMIN-ONLY
 * rather than revoking the `authenticated` grant outright: the exploit (a pool
 * creator rewriting the slate after kickoff, or any user minting a pool with a
 * fabricated prize_pot) is fully closed either way, but revoking the grant
 * would also kill "Sync & Create Weekly Public Pool", which is how the weekly
 * public pool — the revenue pool — gets created. UPDATE 2026-08-08: both routes
 * now write pools/pool_games with createAdminClient(), so the stricter revokes
 * in sections 2 and 7 are ENABLED here, and re-applied to the live database by
 * 20260809000000_lock_pools_pool_games_client_writes.
 * ============================================================================
 */

-- ---------------------------------------------------------------------------
-- 1. card_picks — the stale INSERT/UPDATE policies defeat the kickoff lock
-- ---------------------------------------------------------------------------
-- 20260201000000:385 and :394 created ownership-only INSERT and UPDATE
-- policies. They were never dropped. schema.sql:542 shows a third copy live
-- under a different name. Beside them, "Card picks writable before kickoff"
-- (20260804000000:165) and "Card picks updatable before kickoff"
-- (20260806000000:70) add nothing at all: OR any predicate with
-- "do you own the card" and the result is "do you own the card".
--
-- Concretely, today: wait for Sunday's results, PATCH
-- /rest/v1/card_picks?id=eq.<pick> with the anon key, take the pot. There is
-- no API route involved and nothing in the logs distinguishes it from normal
-- play.
drop policy if exists "Users can insert picks for own cards"        on public.card_picks;
drop policy if exists "Users can create picks for own cards"        on public.card_picks;
drop policy if exists "Users can update picks for own cards"        on public.card_picks;
drop policy if exists "Users can delete picks for own cards"        on public.card_picks;
-- Duplicate SELECT copies. Same predicate as "Card picks holder only", so
-- dropping them changes no read; it removes second copies that a future edit
-- could loosen unnoticed.
drop policy if exists "Users can view picks for their cards"        on public.card_picks;
drop policy if exists "Users can view picks for own cards"          on public.card_picks;
drop policy if exists "Users can view picks in pools they participate in" on public.card_picks;

-- Policies alone are not enough. RLS cannot say WHICH columns an UPDATE may
-- touch, and "Card picks updatable before kickoff" checks game_id's kickoff
-- against the row's own game_id — so the grant is what stops a pick being
-- repointed at a different game. Take the privilege away and hand back only
-- the four columns that /pools/[poolId]/cards/[cardId]/picks actually writes:
--   INSERT { card_id, game_id, prediction, total_score_prediction }
--   UPDATE { prediction, total_score_prediction }
-- (updated_at is set by the update_card_picks_updated_at trigger, and trigger
-- writes are not subject to the caller's column privileges, so it is not
-- granted.)
--
-- `from public` matters: Postgres privileges granted to PUBLIC are inherited
-- by anon and authenticated, and revoking per-role leaves them intact. That is
-- the exact trap documented in 20260805000000_revoke_money_rpc_from_public.
revoke insert, update, delete on public.card_picks from public, anon, authenticated;
grant insert (card_id, game_id, prediction, total_score_prediction)
  on public.card_picks to authenticated;
grant update (prediction, total_score_prediction)
  on public.card_picks to authenticated;

-- DELETE is table-level only in Postgres — there is no column form — and no
-- code path deletes a card_pick with a user-scoped client (the picks route
-- updates in place). So the privilege stays revoked and "Picks deletable
-- before kickoff" (20260806000000:107) is kept only as the guard that would
-- apply if the grant is ever restored.

-- ---------------------------------------------------------------------------
-- 2. pool_games — the slate was frozen in the API and nowhere else
-- ---------------------------------------------------------------------------
-- /pools/[poolId] PATCH refuses to edit a pool once a card exists. RLS did
-- not, so PostgREST skipped the freeze entirely. Two settlement-level attacks
-- follow: DELETE the pool_game you lost (shrinking the denominator that
-- computePoolWinners scores against) or INSERT an extra finished game only
-- your own card picked, which trips the `total !== numFinishedGames`
-- disqualification rule against every other card in the pool.
drop policy if exists "Pool creators can insert pool games" on public.pool_games;
drop policy if exists "Pool creators can delete pool games" on public.pool_games;
-- Live-DB drift: 20260804000000 shipped the creator write path under these
-- "Slate ..." names. The invariant's allow-list expects them gone (pool_games
-- writes become admin-only below), so they must be dropped here too or the
-- invariant aborts the whole file against the live database.
drop policy if exists "Slate editable only before any card is sold"  on public.pool_games;
drop policy if exists "Slate removable only before any card is sold" on public.pool_games;
-- Duplicate SELECT from the live dump (schema.sql:431). Its predicate is a
-- strict subset of "Pool games are viewable by pool members" (which also
-- admits participants via is_pool_participant), so dropping it narrows nothing.
drop policy if exists "Pool games are viewable by pool participants" on public.pool_games;

-- Admin-only, matching how `games` was handled in 20260804000000:42. A pool
-- creator now has no write path to the slate at all; slate management is the
-- admin sync route (requireAdmin) or the service role.
drop policy if exists "Only admins can insert pool games" on public.pool_games;
create policy "Only admins can insert pool games" on public.pool_games
  for insert with check (public.is_admin());

drop policy if exists "Only admins can delete pool games" on public.pool_games;
create policy "Only admins can delete pool games" on public.pool_games
  for delete using (public.is_admin());

-- No UPDATE policy on this table has ever existed, so the privilege is dead
-- weight; remove it. anon loses everything.
revoke insert, update, delete on public.pool_games from public, anon;
revoke update                  on public.pool_games from authenticated;

-- /api/pools/[poolId] PATCH and /api/sync/nfl-games now write pool_games with
-- createAdminClient(), so authenticated has no legitimate write path here.
revoke insert, delete on public.pool_games from authenticated;

-- ---------------------------------------------------------------------------
-- 3. DRIFT — policies that live only in the production database
-- ---------------------------------------------------------------------------
-- schema.sql:501 "Users can create own cards" is an ownership-only INSERT on
-- parlay_cards. 20260806000000:36 dropped only the differently-named "Users
-- can insert own parlay_cards", so this one survived — and a card is the paid
-- instrument: any user could mint themselves free entries into any pool, in
-- any quantity, and play for a pot they never paid into.
drop policy if exists "Users can create own cards"        on public.parlay_cards;
drop policy if exists "Users can insert own parlay_cards" on public.parlay_cards;
drop policy if exists "Users can delete own parlay_cards" on public.parlay_cards;
drop policy if exists "Users can update own parlay_cards" on public.parlay_cards;
drop policy if exists "Users can read own parlay_cards"   on public.parlay_cards;
drop policy if exists "Cards are viewable by pool participants" on public.parlay_cards;
drop policy if exists "Users can view own cards"          on public.parlay_cards;

-- Structural backstop for the same hole. Cards are created only by
-- fulfillCardPurchase() on the service role (both callers use
-- createAdminClient()), and nothing deletes a card with a user-scoped client.
-- The only legitimate client write is the pending -> active lock transition,
-- which 20260806000000:59 already narrowed to (status, updated_at).
revoke insert, delete on public.parlay_cards from public, anon, authenticated;

-- Duplicate SELECT policy on notifications from the live dump (schema.sql:407),
-- identical predicate to "Users can view own notifications".
drop policy if exists "Enable users to view their own data only" on public.notifications;

-- Names earlier migrations claim to have dropped. Re-dropping costs nothing
-- and covers a partial or hand-applied history. NOTE: "Users can view all
-- profiles" is `using (true)` on a table holding email, role and balance — if
-- it somehow survived, the whole customer list is public to the anon key.
drop policy if exists "Users can view all profiles"          on public.users;
drop policy if exists "Users can create own transactions"    on public.pool_transactions;
drop policy if exists "Users can view own transactions"      on public.pool_transactions;
drop policy if exists "Transactions viewable by owner"       on public.pool_transactions;
drop policy if exists "Comments are viewable by pool participants" on public.comments;
drop policy if exists "Authenticated users can create comments"    on public.comments;
drop policy if exists "Picks are viewable by pool participants"    on public.picks;
drop policy if exists "Users can join pools"                 on public.pool_participants;
drop policy if exists "Public pools are viewable by everyone" on public.pools;
drop policy if exists "Authenticated users can insert games"  on public.games;
drop policy if exists "Authenticated users can update games"  on public.games;
-- 20260804000000:217 created "Own payout requests" but never dropped the
-- original from 20260201140000:21, so payout_requests carries a redundant
-- third SELECT policy. Same predicate minus the admin branch.
drop policy if exists "Users can view own payout requests"   on public.payout_requests;
drop policy if exists "Users can insert own payout requests" on public.payout_requests;
drop policy if exists "Request own payout"                   on public.payout_requests;

-- Money tables are service-role-write by design and have no write policy at
-- all; drop the privilege too so one careless future policy is not enough.
revoke insert, update, delete on public.pool_transactions from public, anon, authenticated;
revoke insert, update, delete on public.pool_winners      from public, anon, authenticated;
revoke insert, update, delete on public.payout_approvals  from public, anon, authenticated;
revoke insert, update, delete on public.user_transactions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. pool_invitations — self-invitation into any private pool
-- ---------------------------------------------------------------------------
-- 20260201000000:330 constrains only `invited_by = auth.uid()` and says
-- nothing about the pool or the status. Insert {pool_id: <any private pool>,
-- invited_user_id: self, invited_by: self, status: 'accepted'} and the row
-- satisfies the pool_participants INSERT policy (20260804000000:117-120) that
-- was written to keep strangers out of private pools. Self-service entry.
--
-- 20260806000000:123 states this "was correctly tightened to pool creator
-- invites only". VERIFIED FALSE: no migration in this repo contains such a
-- policy, and the live dump still shows the original. The comment describes an
-- intent, not a deployed state.
drop policy if exists "Users can create invitations"          on public.pool_invitations;
drop policy if exists "Pool creator invites only"             on public.pool_invitations;
drop policy if exists "Pool creator may invite to own pool"   on public.pool_invitations;

create policy "Pool creator may invite to own pool" on public.pool_invitations
  for insert with check (
    auth.uid() = invited_by
    and status = 'pending'
    and exists (select 1 from public.pools p
                where p.id = pool_id and p.created_by = auth.uid())
  );

-- WITH CHECK sees the finished row on INSERT, defaults included, so pinning
-- status there is airtight and a column grant would add nothing. `status` is
-- therefore left grantable on purpose: both writers
-- (/pools/[poolId]/invitations and /pools POST) send status:'pending'
-- explicitly in the payload, and removing the privilege would make them fail
-- with "permission denied for column status" while buying no security.
-- What the grant list does buy is that id and created_at become unwritable.
revoke insert on public.pool_invitations from public, anon, authenticated;
grant insert (pool_id, invited_user_id, invited_by, status)
  on public.pool_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- 5. user_payout_accounts — UPDATE with USING and no WITH CHECK
-- ---------------------------------------------------------------------------
-- 20260204100000:21. USING validates the row as it WAS; the row as it WILL BE
-- is unchecked. So the caller passes USING on their own row and then writes
-- user_id = <victim> with identifier = <attacker's PayPal>. Since the table is
-- unique on user_id the victim's real row cannot coexist — but createPayPalPayout
-- resolves the destination from exactly this table, so a victim with no row yet
-- ends up with the attacker's PayPal address attached to their payouts.
drop policy if exists "Users can update own payout account" on public.user_payout_accounts;
create policy "Users can update own payout account" on public.user_payout_accounts
  for update
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Column grants trim the row down to what /api/me/payout-account PUT sends.
-- user_id is deliberately INSIDE the update list: PostgREST compiles an upsert
-- to `insert ... on conflict (user_id) do update set <every payload column> =
-- excluded.<col>`, conflict target included, so revoking update(user_id) makes
-- that route fail with "permission denied for column user_id". The WITH CHECK
-- above is what actually prevents repointing the row — it rejects any new row
-- whose user_id is not the caller, which is the whole of this finding.
revoke insert, update, delete on public.user_payout_accounts from public, anon, authenticated;
grant insert (user_id, method, identifier, updated_at)
  on public.user_payout_accounts to authenticated;
grant update (user_id, method, identifier, updated_at)
  on public.user_payout_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- 6. teams — writable by any authenticated user
-- ---------------------------------------------------------------------------
-- 20260201000000:254-258. The same `auth.uid() is not null` pattern that was
-- fixed on `games` in 20260804000000:25, missed here. UPDATE has no WITH CHECK
-- either, so even the primary key moves: rename/relogo two teams and every
-- opponent picks the wrong side of a real game.
drop policy if exists "Authenticated users can insert teams" on public.teams;
drop policy if exists "Authenticated users can update teams" on public.teams;

drop policy if exists "Only admins can insert teams" on public.teams;
create policy "Only admins can insert teams" on public.teams
  for insert with check (public.is_admin());

drop policy if exists "Only admins can update teams" on public.teams;
create policy "Only admins can update teams" on public.teams
  for update using (public.is_admin()) with check (public.is_admin());

-- The privilege goes too. /api/admin/sync/teams already writes teams with
-- createAdminClient(), which is unaffected. Two user-scoped upserts remain
-- (pools POST -> getTeamRowsForGames, sync/nfl-games -> ensureTeamsExist) and
-- both will now no-op: neither checks the error, and both are seeding the same
-- 32 rows that must already exist, because games.home_team_id has a foreign
-- key to teams and games are already stored.
revoke insert, update, delete on public.teams from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. pools — INSERT constrained only created_by
-- ---------------------------------------------------------------------------
-- 20260201000000:288. Nothing constrained type, status, entry_fee, prize_pot
-- or is_system_weekly_pool, so any user could mint a pool advertising a
-- fabricated prize_pot — including one flagged as the system weekly pool,
-- which is what the public marketing homepage features.
drop policy if exists "Users can create pools" on public.pools;

drop policy if exists "Only admins can create pools" on public.pools;
create policy "Only admins can create pools" on public.pools
  for insert with check (
    public.is_admin()
    and created_by = auth.uid()
    and coalesce(prize_pot, 0) = 0
    and coalesce(participants, 0) = 0
    and status = 'open'
  );
-- Ordinary users still create pools: /api/pools POST does that insert with
-- createAdminClient() (service role bypasses RLS) after validating the payload
-- itself. This policy governs only direct PostgREST writes, and the admin
-- branch exists solely so /api/sync/nfl-games can keep creating the weekly
-- public pool with the caller's client. prize_pot/participants are pinned to 0
-- because both are derived by get_pool_financials, never authored.

-- UPDATE: initial_schema shipped `using (auth.uid() = created_by)` with no
-- WITH CHECK. 20260806000000 narrowed the columns to (name, max_participants)
-- but referred to a policy called "Creator may edit own pool" that exists in no
-- migration, so the live name is uncertain. Drop both and settle it.
drop policy if exists "Users can update own pools" on public.pools;
drop policy if exists "Creator may edit own pool"  on public.pools;
create policy "Creator may edit own pool" on public.pools
  for update
  using      (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- Re-assert 20260806000000's column grants so this file is self-contained.
revoke insert, update, delete on public.pools from public, anon;
revoke update                  on public.pools from authenticated;
grant  update (name, max_participants) on public.pools to authenticated;

-- /api/sync/nfl-games and /api/pools[/[poolId]] now write pools with
-- createAdminClient(), so authenticated has no INSERT/DELETE path here.
revoke insert, delete on public.pools from authenticated;

-- ---------------------------------------------------------------------------
-- 8. get_pool_financials / get_pools_financials — revenue leak to anon
-- ---------------------------------------------------------------------------
-- 20260805000002:19-20 re-granted EXECUTE to anon and authenticated on the
-- grounds that RLS policies need it. VERIFIED FALSE: grepping every `create
-- policy` in supabase/migrations plus every policy in schema.sql finds neither
-- function in any predicate. The only callers are getPoolFinancials /
-- getPoolsFinancials in src/lib/pool-financials.ts, and both were switched to
-- createAdminClient() internally (confirmed by reading the file), so the client
-- roles do not need EXECUTE.
--
-- Both are SECURITY DEFINER over pool_transactions with RLS bypassed and take
-- an arbitrary pool id, so /rest/v1/rpc/get_pool_financials with the anon key
-- returned gross revenue and distinct payer counts for ANY pool, private ones
-- included. get_pools_financials takes an array, so the whole book in one call.
revoke execute on function public.get_pool_financials(uuid)    from public, anon, authenticated;
revoke execute on function public.get_pools_financials(uuid[]) from public, anon, authenticated;
grant  execute on function public.get_pool_financials(uuid)    to service_role;
grant  execute on function public.get_pools_financials(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 9. is_pool_participant / has_parlay_card_in_pool — cross-user oracle
-- ---------------------------------------------------------------------------
-- These two must KEEP execute for anon and authenticated. 20260805000001
-- revoked it and every read governed by a policy that calls them died with
-- 42501; 20260805000002 is the revert. Do not repeat that.
--
-- The leak is the signature: the subject is a caller-supplied argument, so
-- anon can POST /rest/v1/rpc/is_pool_participant with any user id and get a
-- boolean back — an enumeration oracle over who plays which pool, for a
-- gambling product, without logging in.
--
-- Fix the bodies instead. Signatures and argument names are unchanged (a
-- `create or replace` cannot rename parameters, and every existing policy
-- keeps working), the grants survive the replace, and p_user_id is accepted
-- and ignored. auth.uid() reads the request GUC, which SECURITY DEFINER does
-- not disturb — is_admin() (20260804000000:28) already relies on that.
--
-- CALL-SITE AUDIT before changing behaviour. Every reference, anywhere:
--   20260201100000:23  pools SELECT      is_pool_participant(id, auth.uid())
--   20260201100000:37  pool_games SELECT is_pool_participant(p.id, auth.uid())
--   20260201100000:55  pool_participants SELECT is_pool_participant(pool_id, auth.uid())
--   20260205100000:25  pools SELECT      has_parlay_card_in_pool(pools.id, auth.uid())
--   20260205100000:30  pools SELECT      is_pool_participant(pools.id, auth.uid())
-- and no RPC call in src/ at all. Every one already passes auth.uid(), so the
-- rewrite is a behavioural no-op for policy evaluation.
--
-- CORRECTION to the audit note that 20260205100000:20-31 "passes NULL, making
-- that policy always-false": the argument is auth.uid(), which is NULL only
-- when the caller is anon. Completed pools are therefore invisible to logged-out
-- visitors, and the pool_winners ticker (whose policy joins to pools) shows
-- them nothing. That is a real defect, but it is not caused by these functions
-- and substituting auth.uid() cannot change it — NULL in, NULL used. LEFT
-- DELIBERATELY UNCHANGED: neither the pools SELECT policy nor the pool_winners
-- ticker policy is touched by this file, so anon visibility is bit-for-bit what
-- it is today. Fixing the ticker means widening completed-pool visibility to
-- anon, which is a product decision, not a security fix, and it does not belong
-- in a migration whose job is to close write holes.
create or replace function public.is_pool_participant(p_pool_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  -- p_user_id is accepted for signature compatibility and intentionally
  -- ignored: answering about anyone but the caller is the vulnerability.
  select exists (
    select 1 from public.pool_participants
    where pool_id = p_pool_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_parlay_card_in_pool(p_pool_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  -- p_user_id ignored — see is_pool_participant above.
  select exists (
    select 1 from public.parlay_cards
    where pool_id = p_pool_id
      and user_id = auth.uid()
      and status in ('pending', 'active', 'completed')
  );
$$;

comment on function public.is_pool_participant(uuid, uuid) is
  'Participation test for the CALLER. p_user_id is ignored on purpose; the argument exists only so existing RLS policies keep their signature.';
comment on function public.has_parlay_card_in_pool(uuid, uuid) is
  'Card-holding test for the CALLER. p_user_id is ignored on purpose; see is_pool_participant.';

-- Re-assert the grants the RLS helpers need, in case a replace ever lands on a
-- database where 20260805000002 was not applied.
grant execute on function public.is_pool_participant(uuid, uuid)     to anon, authenticated;
grant execute on function public.has_parlay_card_in_pool(uuid, uuid) to anon, authenticated;
grant execute on function public.is_admin()                          to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. users — INSERT did not constrain role or balance
-- ---------------------------------------------------------------------------
-- 20260201000000:244 checks only `auth.uid() = id`. handle_new_user() normally
-- creates the row first so the path is unreachable — but the trigger is one
-- `security definer` function away from failing, and any user whose profile row
-- is missing (trigger error, partial restore, manual cleanup) can then create
-- it themselves with role='admin' and a balance of their choosing.
drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile" on public.users
  for insert with check (
    auth.uid() = id
    and coalesce(role, 'user') = 'user'
    and coalesce(balance, 0) = 0
  );

-- Backed by grants: the only user-scoped insert in the tree is the signup
-- fallback in /api/auth/signup, which writes exactly (id, email, name, avatar).
-- role and balance stay at their defaults because they cannot be supplied.
revoke insert on public.users from public, anon, authenticated;
grant  insert (id, email, name, avatar) on public.users to authenticated;
-- UPDATE is left as 20260804000000:91 set it — its WITH CHECK already pins role
-- and balance to their stored values.

-- ---------------------------------------------------------------------------
-- 11. newsletter_subscribers — live table, no migration, unknown RLS
-- ---------------------------------------------------------------------------
-- Referenced only by /api/newsletter/subscribe, which inserts with the ANON
-- client. So anon demonstrably holds INSERT — and if RLS was never enabled on
-- this hand-made table, anon also holds SELECT, i.e. the full marketing list of
-- a real-money gambling product is one PostgREST GET away.
--
-- `create table if not exists` will no-op against the live table; the grants
-- and policy below are what actually matter and they apply either way.
create table if not exists public.newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  created_at timestamp with time zone not null default now()
);

alter table public.newsletter_subscribers enable row level security;
-- FORCE so the table owner is covered too. service_role holds BYPASSRLS, so
-- reading the list from server code is unaffected.
alter table public.newsletter_subscribers force row level security;

drop policy if exists "Anyone can subscribe" on public.newsletter_subscribers;
create policy "Anyone can subscribe" on public.newsletter_subscribers
  for insert with check (true);

-- No SELECT policy exists and none should. Reads are denied twice over:
-- privilege removed AND no policy. The subscribe route sends no `select` (it
-- inserts with return=minimal and only inspects the SQLSTATE), so it is
-- unaffected.
revoke all                on public.newsletter_subscribers from public, anon, authenticated;
grant  insert (email)     on public.newsletter_subscribers to anon, authenticated;

-- Unique email makes the route's "already subscribed and newly subscribed must
-- be indistinguishable" 23505 branch real rather than aspirational. Guarded:
-- if the live table already holds duplicates the index cannot be built, and
-- that must not abort a migration full of security fixes.
do $$
begin
  create unique index if not exists newsletter_subscribers_email_key
    on public.newsletter_subscribers (email);
exception when others then
  raise warning
    'newsletter_subscribers: unique index on (email) NOT created — % — de-duplicate the table and re-run just that statement',
    sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 12. picks / notifications — UPDATE with USING and no WITH CHECK
-- ---------------------------------------------------------------------------
-- 20260201000000:349 and :274. USING passes on the row you own, and the new
-- row is never checked, so `set user_id = <someone else>` succeeds and the row
-- is handed to another account.
--
-- `picks` is the legacy pre-parlay table and has no reader or writer left in
-- src/ (verified: zero references to from("picks")), so narrowing it is free.
drop policy if exists "Users can update own picks" on public.picks;
create policy "Users can update own picks" on public.picks
  for update
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke insert, update, delete on public.picks from public, anon, authenticated;
grant  insert (pool_id, user_id, game_id, team_id, prediction, total_score_prediction)
  on public.picks to authenticated;
grant  update (team_id, prediction, total_score_prediction)
  on public.picks to authenticated;

-- notifications: the read flag column is read_at (timestamptz, nullable) —
-- confirmed against 20260201000000:60 and the partial index at :220. It is the
-- only column any client writes (/api/notifications/[id]/read sends exactly
-- { read_at }), and updated_at is set by a trigger.
drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications" on public.notifications
  for update
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke insert, update on public.notifications from public, anon, authenticated;
grant  update (read_at) on public.notifications to authenticated;
-- DELETE is left alone: "Users can delete own notifications" is a real feature
-- and a delete cannot reassign a row.

-- ---------------------------------------------------------------------------
-- 13. Money CHECK constraints — the schema had exactly one
-- ---------------------------------------------------------------------------
-- user_transactions_final_check (20260202100000:15) was the only arithmetic
-- invariant in the entire database. Everything below is added NOT VALID: it
-- binds every future write immediately but does not scan existing rows, so a
-- legacy row that already violates it cannot abort this migration on a live
-- database. Validate them after auditing, with the commented statements at the
-- end of this section.
alter table public.users drop constraint if exists users_balance_non_negative;
alter table public.users add constraint users_balance_non_negative
  check (balance >= 0) not valid;

alter table public.pool_transactions drop constraint if exists pool_transactions_amount_positive;
alter table public.pool_transactions add constraint pool_transactions_amount_positive
  check (amount > 0) not valid;

alter table public.payout_requests drop constraint if exists payout_requests_amount_positive;
alter table public.payout_requests add constraint payout_requests_amount_positive
  check (amount > 0) not valid;

alter table public.payout_approvals drop constraint if exists payout_approvals_amount_positive;
alter table public.payout_approvals add constraint payout_approvals_amount_positive
  check (amount > 0) not valid;

-- DELIBERATELY >= 0, not > 0. materializePoolWinners inserts every winner row
-- in one batch and then skips crediting any row whose amount is not > 0
-- (src/lib/materialize-winners.ts:130-132) — a zero share is a tolerated
-- rounding outcome when the post-fee pot splits into fewer cents than winners.
-- A strict > 0 would make that single row abort the whole insert and leave a
-- real pool unsettled. Negative is the thing that must never happen.
alter table public.pool_winners drop constraint if exists pool_winners_amount_non_negative;
alter table public.pool_winners add constraint pool_winners_amount_non_negative
  check (amount >= 0) not valid;

alter table public.platform_settings drop constraint if exists platform_settings_fee_percentage_range;
alter table public.platform_settings add constraint platform_settings_fee_percentage_range
  check (platform_fee_percentage >= 0 and platform_fee_percentage < 100) not valid;

-- One pending withdrawal per user. Without it, N concurrent POSTs to
-- /api/me/payout-request each pass the balance check in the route and queue N
-- separate withdrawals of the same funds; the admin sees a plausible list.
-- Guarded — if production already holds a user with two pending rows, the
-- index cannot be built and that must not roll back the security fixes above.
do $$
begin
  create unique index if not exists idx_payout_requests_one_pending_per_user
    on public.payout_requests (user_id) where status = 'pending';
exception when others then
  raise warning
    'payout_requests: one-pending-per-user index NOT created — % — resolve the duplicate pending requests and re-run just that statement',
    sqlerrm;
end $$;

/*
 * Run AFTER auditing existing rows (each takes a SHARE UPDATE EXCLUSIVE lock
 * and scans the table; each fails loudly if a legacy row violates it, which is
 * the point of doing it separately):
 *
 *   alter table public.users              validate constraint users_balance_non_negative;
 *   alter table public.pool_transactions  validate constraint pool_transactions_amount_positive;
 *   alter table public.payout_requests    validate constraint payout_requests_amount_positive;
 *   alter table public.payout_approvals   validate constraint payout_approvals_amount_positive;
 *   alter table public.pool_winners       validate constraint pool_winners_amount_non_negative;
 *   alter table public.platform_settings  validate constraint platform_settings_fee_percentage_range;
 *
 * Find the offenders first:
 *   select id, balance from public.users where balance < 0;
 *   select id, amount  from public.pool_transactions where amount <= 0;
 *   select id, amount  from public.payout_requests   where amount <= 0;
 *   select id, amount  from public.payout_approvals  where amount <= 0;
 *   select id, amount  from public.pool_winners      where amount <  0;
 *   select id, platform_fee_percentage from public.platform_settings
 *     where platform_fee_percentage < 0 or platform_fee_percentage >= 100;
 */

-- ---------------------------------------------------------------------------
-- 14. THE INVARIANT — this is why the stale policies survived a hardening pass
-- ---------------------------------------------------------------------------
-- 20260804000000:397 asserted the end state instead of trusting its own drops,
-- which is the right instinct, and then filtered `cmd in ('SELECT','ALL')`.
-- Every hole this file closes is an INSERT or UPDATE policy. They sat directly
-- under an assertion designed to catch exactly this and it looked straight
-- past them, twice, while reporting success.
--
-- So: every command, every money and game-integrity table, an explicit
-- (table, policy) allow-list, exception on anything unexpected. A policy that
-- is not on this list is either a hole or a rename, and both must be looked at
-- by a human before this database accepts another bet.
do $$
declare
  v_unexpected text;
  v_missing    text;
  v_tables     text[] := array[
    'users', 'teams', 'games', 'notifications', 'platform_settings',
    'pools', 'pool_games', 'pool_participants', 'pool_invitations',
    'picks', 'parlay_cards', 'card_picks', 'pool_transactions', 'comments',
    'pool_winners', 'payout_requests', 'payout_approvals',
    'user_transactions', 'user_payout_accounts', 'profiles',
    'newsletter_subscribers'
  ];
  v_allowed    text[][] := array[
    -- users
    ['users', 'Users can view their own profile'],
    ['users', 'Admins can view all profiles'],
    ['users', 'Users can insert own profile'],
    ['users', 'Users can update own profile'],
    -- teams
    ['teams', 'Teams are viewable by everyone'],
    ['teams', 'Only admins can insert teams'],
    ['teams', 'Only admins can update teams'],
    -- games
    ['games', 'Games are viewable by everyone'],
    ['games', 'Only admins can insert games'],
    ['games', 'Only admins can update games'],
    -- notifications
    ['notifications', 'Users can view own notifications'],
    ['notifications', 'Users can update own notifications'],
    ['notifications', 'Users can delete own notifications'],
    -- platform_settings
    ['platform_settings', 'Anyone can view platform settings'],
    -- pools
    ['pools', 'Users can view pools they created or participate in'],
    ['pools', 'Only admins can create pools'],
    ['pools', 'Creator may edit own pool'],
    -- pool_games
    ['pool_games', 'Pool games are viewable by pool members'],
    ['pool_games', 'Only admins can insert pool games'],
    ['pool_games', 'Only admins can delete pool games'],
    -- pool_participants
    ['pool_participants', 'Pool participants are viewable by pool participants'],
    ['pool_participants', 'Users can join pools they are entitled to'],
    -- pool_invitations
    ['pool_invitations', 'Users can view own invitations'],
    ['pool_invitations', 'Pool creator may invite to own pool'],
    ['pool_invitations', 'Invitee may only answer'],
    -- picks (legacy)
    ['picks', 'Own picks only'],
    ['picks', 'Users can create own picks'],
    ['picks', 'Users can update own picks'],
    -- parlay_cards
    ['parlay_cards', 'Card holder only'],
    ['parlay_cards', 'Card editable while pending'],
    -- card_picks
    ['card_picks', 'Card picks holder only'],
    ['card_picks', 'Card picks writable before kickoff'],
    ['card_picks', 'Card picks updatable before kickoff'],
    ['card_picks', 'Picks deletable before kickoff'],
    -- pool_transactions
    ['pool_transactions', 'Own transactions only'],
    -- comments
    ['comments', 'Chat readable by card holders'],
    ['comments', 'Chat postable by card holders'],
    -- pool_winners
    ['pool_winners', 'Users can view own pool wins'],
    ['pool_winners', 'Anyone can view pool winners for completed pools (ticker)'],
    -- payout_requests
    ['payout_requests', 'Own payout requests'],
    ['payout_requests', 'Admin can view all payout requests'],
    ['payout_requests', 'Request own payout within balance'],
    -- payout_approvals
    ['payout_approvals', 'Users can view own payout approvals'],
    ['payout_approvals', 'Admin can view all payout approvals'],
    -- user_transactions
    ['user_transactions', 'Users can view own transactions'],
    ['user_transactions', 'Admin can view all transactions'],
    -- user_payout_accounts
    ['user_payout_accounts', 'Users can view own payout account'],
    ['user_payout_accounts', 'Admin can view all payout accounts'],
    ['user_payout_accounts', 'Users can insert own payout account'],
    ['user_payout_accounts', 'Users can update own payout account'],
    -- profiles (display names only)
    ['profiles', 'Profiles are publicly readable'],
    -- newsletter_subscribers
    ['newsletter_subscribers', 'Anyone can subscribe']
  ];
  v_allow_rows text[];
begin
  -- Flatten the 2-D literal into (table, policy) rows once.
  select array_agg(v_allowed[i][1] || E'' || v_allowed[i][2])
    into v_allow_rows
  from generate_subscripts(v_allowed, 1) as i;

  select string_agg(format('%s."%s" [%s]', p.tablename, p.policyname, p.cmd),
                    ', ' order by p.tablename, p.policyname)
    into v_unexpected
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = any (v_tables)
    and not (p.tablename::text || E'' || p.policyname::text) = any (v_allow_rows);

  if v_unexpected is not null then
    raise exception
      'RLS INVARIANT VIOLATED — unexpected policy on a money/game-integrity table: %. Permissive policies are OR-ed, so an unrecognised policy grants whatever it says regardless of every strict policy beside it. Refusing to apply.',
      v_unexpected;
  end if;

  -- The other direction. A missing policy denies access rather than granting
  -- it, so it is breakage, not a hole: warn, do not roll back. In practice
  -- this fires when 20260804000000 or 20260806000000 was never applied.
  select string_agg(x.entry, ', ' order by x.entry)
    into v_missing
  from (
    select v_allowed[i][1] || '."' || v_allowed[i][2] || '"' as entry
    from generate_subscripts(v_allowed, 1) as i
    where not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename::text  = v_allowed[i][1]
        and p.policyname::text = v_allowed[i][2]
    )
  ) x;

  if v_missing is not null then
    raise warning
      'RLS: expected policy missing (access is DENIED where it should be allowed — check that 20260804000000 and 20260806000000 were applied): %',
      v_missing;
  end if;
end $$;

-- The policy set is only half of it. RLS cannot restrict columns and cannot
-- act at all without a table privilege behind it, so assert the grants that
-- the fixes above depend on. Table-level privilege is what these check:
-- has_table_privilege ignores column grants (that is has_any_column_privilege),
-- which is exactly the distinction being asserted.
do $$
declare
  v_bad text := '';
begin
  -- CRIT-1: card_picks must be reachable ONLY through the granted columns.
  if has_table_privilege('authenticated', 'public.card_picks', 'INSERT')
     then v_bad := v_bad || 'authenticated has table-wide INSERT on card_picks; '; end if;
  if has_table_privilege('authenticated', 'public.card_picks', 'UPDATE')
     then v_bad := v_bad || 'authenticated has table-wide UPDATE on card_picks; '; end if;
  if has_table_privilege('authenticated', 'public.card_picks', 'DELETE')
     then v_bad := v_bad || 'authenticated can DELETE card_picks; '; end if;
  if has_column_privilege('authenticated', 'public.card_picks', 'game_id', 'UPDATE')
     then v_bad := v_bad || 'authenticated can UPDATE card_picks.game_id — a pick can be repointed at a finished game; '; end if;
  if has_column_privilege('authenticated', 'public.card_picks', 'card_id', 'UPDATE')
     then v_bad := v_bad || 'authenticated can UPDATE card_picks.card_id — a pick can be moved to another card; '; end if;

  -- DRIFT: cards are minted by the service role only.
  if has_table_privilege('authenticated', 'public.parlay_cards', 'INSERT')
     then v_bad := v_bad || 'authenticated can INSERT parlay_cards — free entries; '; end if;
  if has_table_privilege('authenticated', 'public.parlay_cards', 'DELETE')
     then v_bad := v_bad || 'authenticated can DELETE parlay_cards; '; end if;

  -- CRIT-2 / MED: the slate and the team table.
  if has_table_privilege('authenticated', 'public.pool_games', 'UPDATE')
     then v_bad := v_bad || 'authenticated can UPDATE pool_games; '; end if;
  if has_table_privilege('anon', 'public.pool_games', 'INSERT')
     or has_table_privilege('anon', 'public.pool_games', 'DELETE')
     then v_bad := v_bad || 'anon can write pool_games; '; end if;
  if has_any_column_privilege('authenticated', 'public.teams', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.teams', 'UPDATE')
     then v_bad := v_bad || 'authenticated can write teams; '; end if;

  -- Money tables: service role only.
  if has_any_column_privilege('authenticated', 'public.pool_transactions', 'INSERT')
     then v_bad := v_bad || 'authenticated can INSERT pool_transactions — the pot is client-writable; '; end if;
  if has_any_column_privilege('authenticated', 'public.pool_winners', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.user_transactions', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.payout_approvals', 'INSERT')
     then v_bad := v_bad || 'authenticated can INSERT into a settlement table; '; end if;

  -- MED: self-promotion.
  if has_table_privilege('authenticated', 'public.users', 'INSERT')
     then v_bad := v_bad || 'authenticated has table-wide INSERT on users (role/balance become settable); '; end if;
  if has_column_privilege('authenticated', 'public.users', 'role', 'INSERT')
     then v_bad := v_bad || 'authenticated can INSERT users.role; '; end if;
  if has_column_privilege('authenticated', 'public.users', 'balance', 'INSERT')
     then v_bad := v_bad || 'authenticated can INSERT users.balance; '; end if;

  -- The marketing list must not be readable, and the RPCs must not be callable.
  if has_any_column_privilege('anon', 'public.newsletter_subscribers', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.newsletter_subscribers', 'SELECT')
     then v_bad := v_bad || 'the newsletter list is client-readable; '; end if;
  if has_function_privilege('anon', 'public.get_pool_financials(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_pool_financials(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_pools_financials(uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_pools_financials(uuid[])', 'EXECUTE')
     then v_bad := v_bad || 'the financials RPCs are still callable by a client role; '; end if;

  if v_bad <> '' then
    raise exception 'GRANT INVARIANT VIOLATED — %. Refusing to apply.', v_bad;
  end if;

  -- The inverse assertion, and the one that has actually broken this database
  -- before: revoking EXECUTE on a helper used inside an RLS predicate makes
  -- every read governed by that policy fail with 42501. See 20260805000002.
  if not has_function_privilege('anon', 'public.is_pool_participant(uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.has_parlay_card_in_pool(uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.is_admin()', 'EXECUTE')
  then
    raise exception
      'RLS helper EXECUTE was revoked from anon. Policies on pools/pool_games/comments call these; without EXECUTE every such read fails with 42501. Refusing to apply.';
  end if;
end $$;
