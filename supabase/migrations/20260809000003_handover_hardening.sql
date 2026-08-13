-- ============================================================================
-- HANDOVER HARDENING (2026-08-12)
--
-- Closes every remaining actionable security-advisor finding and the deferred
-- items from the earlier hardening passes, right before client handover:
--
--   1. Client roles lose EXECUTE on the trigger functions and on
--      claim_pool_payout for anon (the claim RPC requires a session anyway).
--   2. The three deliberately-public SECURITY DEFINER RPCs are annotated so
--      the recurring advisor warnings are documented as intentional.
--   3. The vestigial anon ticker policy on pool_winners is dropped — the
--      public ticker goes exclusively through get_public_winners(), which
--      returns a minimal projection with no user UUIDs (anon holds no table
--      SELECT grant on pool_winners, so the policy granted nothing anyway).
--   4. The six NOT VALID money CHECK constraints from 20260807000000 are
--      validated (row audit on 2026-08-12 found zero violations).
--   5. The legacy `picks` table is dropped (empty; settlement never read it;
--      the API tombstone at /cards/[cardId]/submit already 410s).
--   6. Every RLS policy that re-evaluated auth.uid() per row now uses the
--      (select auth.uid()) initplan form — same predicates, evaluated once
--      per query. Rewrites were generated mechanically from pg_policies.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Function EXECUTE lockdown
-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger functions fire via the trigger machinery regardless of the caller's
-- EXECUTE privilege; exposing them at /rest/v1/rpc/* served nothing.
revoke all on function public.set_pool_transaction_fee() from public, anon, authenticated;
revoke all on function public.set_pool_platform_fee()    from public, anon, authenticated;

-- claim_pool_payout derives the claimant from auth.uid() and returns
-- 'unauthenticated' for anon — but anon has no business calling it at all.
revoke execute on function public.claim_pool_payout(uuid) from public, anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Documented advisor exceptions (0028/0029 will keep flagging these three;
--    that is intentional and safe)
-- ─────────────────────────────────────────────────────────────────────────────
comment on function public.get_public_winners(integer) is
  'INTENTIONALLY anon-executable (security-advisor exception). Public winners '
  'ticker on the marketing homepage. SECURITY DEFINER on purpose: pool_winners '
  'itself is not anon-readable; this returns a minimal projection (no user '
  'UUIDs), filters to completed pools, and clamps the limit to 1-100.';

comment on function public.get_pool_financials(uuid) is
  'INTENTIONALLY anon-executable (security-advisor exception). Prize-pot and '
  'player-count aggregates for the logged-out lobby (/public-pools) and pool '
  'pages. SECURITY DEFINER because pool_transactions is owner-readable only; '
  'exposes sums/counts, never rows. Revoking anon re-introduces the "$0 prize '
  'pot" bug for logged-out visitors.';

comment on function public.get_pools_financials(uuid[]) is
  'INTENTIONALLY anon-executable (security-advisor exception). Batched form '
  'of get_pool_financials for the lobby list; same reasoning applies.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pool_winners: RPC-only for the public; policy cleanup
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Anyone can view pool winners for completed pools (ticker)"
  on public.pool_winners;
revoke select on public.pool_winners from anon;

-- Fresh-rebuild cleanup: 20260807000003_final_audit_fixes also creates
-- "Pool owner invites only", which blocks self-invites outright. The policy
-- that production actually runs ("Pool creator may invite to own pool",
-- creator-only + status='pending') is kept instead: a creator inviting
-- themselves is the one legitimate way to play their OWN private pool, since
-- pool_participants requires the pool to be public or an accepted invitation.
drop policy if exists "Pool owner invites only" on public.pool_invitations;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Validate the money-integrity CHECK constraints (added NOT VALID by
--    20260807000000_close_stale_write_policies; rows audited clean 2026-08-12)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and contype = 'c'
      and not convalidated
      and conname in (
        'payout_approvals_amount_positive',
        'payout_requests_amount_positive',
        'platform_settings_fee_percentage_range',
        'pool_transactions_amount_positive',
        'pool_winners_amount_non_negative',
        'users_balance_non_negative'
      )
  loop
    execute format('alter table %s validate constraint %I', c.tbl, c.conname);
  end loop;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Drop the legacy picks table (0 rows; nothing reads it; the settlement
--    engine scores card_picks only — see 20260809000001_drop_legacy_picks)
-- ─────────────────────────────────────────────────────────────────────────────
drop table if exists public.picks;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS initplan fix: auth.uid() -> (select auth.uid()) everywhere.
--    Same predicates, evaluated once per statement instead of once per row
--    (advisor lint 0003_auth_rls_initplan). Generated from live pg_policies;
--    each rewrite is guarded so a missing policy skips loudly instead of
--    aborting the migration.
-- ─────────────────────────────────────────────────────────────────────────────
do $init$
declare
  s text;
begin
  foreach s in array array[
    $p$alter policy "Card picks holder only" on public.card_picks
  using ((EXISTS ( SELECT 1
   FROM parlay_cards c
  WHERE ((c.id = card_picks.card_id) AND (c.user_id = (select auth.uid()))))))$p$,
    $p$alter policy "Card picks updatable before kickoff" on public.card_picks
  using (((EXISTS ( SELECT 1
   FROM parlay_cards c
  WHERE ((c.id = card_picks.card_id) AND (c.user_id = (select auth.uid())) AND (c.status = 'pending'::text)))) AND (EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = card_picks.game_id) AND (g.date > now()) AND (g.status = 'scheduled'::text))))))
  with check (((EXISTS ( SELECT 1
   FROM parlay_cards c
  WHERE ((c.id = card_picks.card_id) AND (c.user_id = (select auth.uid())) AND (c.status = 'pending'::text)))) AND (EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = card_picks.game_id) AND (g.date > now()) AND (g.status = 'scheduled'::text))))))$p$,
    $p$alter policy "Card picks writable before kickoff" on public.card_picks
  with check (((EXISTS ( SELECT 1
   FROM parlay_cards c
  WHERE ((c.id = card_picks.card_id) AND (c.user_id = (select auth.uid())) AND (c.status = 'pending'::text)))) AND (EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = card_picks.game_id) AND (g.date > now()) AND (g.status = 'scheduled'::text))))))$p$,
    $p$alter policy "Picks deletable before kickoff" on public.card_picks
  using (((EXISTS ( SELECT 1
   FROM parlay_cards c
  WHERE ((c.id = card_picks.card_id) AND (c.user_id = (select auth.uid())) AND (c.status = 'pending'::text)))) AND (EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = card_picks.game_id) AND (g.date > now()) AND (g.status = 'scheduled'::text))))))$p$,
    $p$alter policy "Chat postable by card holders" on public.comments
  with check ((((select auth.uid()) = user_id) AND ((EXISTS ( SELECT 1
   FROM parlay_cards c
  WHERE ((c.pool_id = comments.pool_id) AND (c.user_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM pool_participants pp
  WHERE ((pp.pool_id = comments.pool_id) AND (pp.user_id = (select auth.uid()))))))))$p$,
    $p$alter policy "Chat readable by card holders" on public.comments
  using ((private.is_admin() OR (EXISTS ( SELECT 1
   FROM parlay_cards c
  WHERE ((c.pool_id = comments.pool_id) AND (c.user_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM pool_participants pp
  WHERE ((pp.pool_id = comments.pool_id) AND (pp.user_id = (select auth.uid())))))))$p$,
    $p$alter policy "Users can delete own notifications" on public.notifications
  using (((select auth.uid()) = user_id))$p$,
    $p$alter policy "Users can update own notifications" on public.notifications
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id))$p$,
    $p$alter policy "Users can view own notifications" on public.notifications
  using (((select auth.uid()) = user_id))$p$,
    -- Upgraded to the 20260807000003_final_audit_fixes §6c predicate (pool
    -- must still be open/active), not the looser pre-audit shape live carried:
    -- a card must never become scoreable after its pool stopped accepting play.
    $p$alter policy "Card editable while pending" on public.parlay_cards
  using (((user_id = (select auth.uid())) AND (status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM pools p
  WHERE ((p.id = pool_id) AND (p.status = ANY (ARRAY['open'::text, 'active'::text])))))))
  with check (((user_id = (select auth.uid())) AND (status = ANY (ARRAY['pending'::text, 'active'::text])) AND (EXISTS ( SELECT 1
   FROM pools p
  WHERE ((p.id = pool_id) AND (p.status = ANY (ARRAY['open'::text, 'active'::text])))))))$p$,
    $p$alter policy "Card holder only" on public.parlay_cards
  using (((select auth.uid()) = user_id))$p$,
    $p$alter policy "Admin can view all payout approvals" on public.payout_approvals
  using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.role = 'admin'::text)))))$p$,
    $p$alter policy "Users can view own payout approvals" on public.payout_approvals
  using (((select auth.uid()) = user_id))$p$,
    $p$alter policy "Admin can view all payout requests" on public.payout_requests
  using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.role = 'admin'::text)))))$p$,
    $p$alter policy "Own payout requests" on public.payout_requests
  using ((((select auth.uid()) = user_id) OR private.is_admin()))$p$,
    $p$alter policy "Request own payout within balance" on public.payout_requests
  with check ((((select auth.uid()) = user_id) AND (amount > (0)::numeric) AND (status = 'pending'::text) AND (amount <= COALESCE(( SELECT u.balance
   FROM users u
  WHERE (u.id = (select auth.uid()))), (0)::numeric))))$p$,
    $p$alter policy "Pool games are viewable by pool members" on public.pool_games
  using ((EXISTS ( SELECT 1
   FROM pools p
  WHERE ((p.id = pool_games.pool_id) AND ((p.type = 'public'::text) OR (p.created_by = (select auth.uid())) OR private.is_pool_participant(p.id, (select auth.uid())))))))$p$,
    $p$alter policy "Invitee may only answer" on public.pool_invitations
  using (((select auth.uid()) = invited_user_id))
  with check ((((select auth.uid()) = invited_user_id) AND (status = ANY (ARRAY['accepted'::text, 'declined'::text]))))$p$,
    $p$alter policy "Pool creator may invite to own pool" on public.pool_invitations
  with check ((((select auth.uid()) = invited_by) AND (status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM pools p
  WHERE ((p.id = pool_invitations.pool_id) AND (p.created_by = (select auth.uid())))))))$p$,
    $p$alter policy "Users can view own invitations" on public.pool_invitations
  using ((((select auth.uid()) = invited_user_id) OR ((select auth.uid()) = invited_by)))$p$,
    $p$alter policy "Pool participants are viewable by pool participants" on public.pool_participants
  using (((EXISTS ( SELECT 1
   FROM pools p
  WHERE ((p.id = pool_participants.pool_id) AND ((p.type = 'public'::text) OR (p.created_by = (select auth.uid())))))) OR private.is_pool_participant(pool_id, (select auth.uid()))))$p$,
    $p$alter policy "Users can join pools they are entitled to" on public.pool_participants
  with check ((((select auth.uid()) = user_id) AND ((EXISTS ( SELECT 1
   FROM pools p
  WHERE ((p.id = pool_participants.pool_id) AND (p.type = 'public'::text)))) OR (EXISTS ( SELECT 1
   FROM pool_invitations i
  WHERE ((i.pool_id = pool_participants.pool_id) AND (i.invited_user_id = (select auth.uid())) AND (i.status = 'accepted'::text)))))))$p$,
    $p$alter policy "Own transactions only" on public.pool_transactions
  using ((((select auth.uid()) = user_id) OR private.is_admin()))$p$,
    $p$alter policy "Users can view own pool wins" on public.pool_winners
  using (((select auth.uid()) = user_id))$p$,
    $p$alter policy "Creator may edit own pool" on public.pools
  using (((select auth.uid()) = created_by))
  with check (((select auth.uid()) = created_by))$p$,
    $p$alter policy "Only admins can create pools" on public.pools
  with check ((private.is_admin() AND (created_by = (select auth.uid())) AND (COALESCE(prize_pot, (0)::numeric) = (0)::numeric) AND (COALESCE(participants, 0) = 0) AND (status = 'open'::text)))$p$,
    $p$alter policy "Users can view pools they created or participate in" on public.pools
  using ((((status <> 'completed'::text) OR (created_by = (select auth.uid())) OR private.has_parlay_card_in_pool(id, (select auth.uid()))) AND ((type = 'public'::text) OR (created_by = (select auth.uid())) OR private.is_pool_participant(id, (select auth.uid())))))$p$,
    $p$alter policy "Admin can view all payout accounts" on public.user_payout_accounts
  using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.role = 'admin'::text)))))$p$,
    $p$alter policy "Users can insert own payout account" on public.user_payout_accounts
  with check (((select auth.uid()) = user_id))$p$,
    $p$alter policy "Users can update own payout account" on public.user_payout_accounts
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id))$p$,
    $p$alter policy "Users can view own payout account" on public.user_payout_accounts
  using (((select auth.uid()) = user_id))$p$,
    $p$alter policy "Admin can view all transactions" on public.user_transactions
  using ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND (users.role = 'admin'::text)))))$p$,
    $p$alter policy "Users can view own transactions" on public.user_transactions
  using (((select auth.uid()) = user_id))$p$,
    $p$alter policy "Users can insert own profile" on public.users
  with check ((((select auth.uid()) = id) AND (COALESCE(role, 'user'::text) = 'user'::text) AND (COALESCE(balance, (0)::numeric) = (0)::numeric)))$p$,
    $p$alter policy "Users can update own profile" on public.users
  using (((select auth.uid()) = id))
  with check ((((select auth.uid()) = id) AND (NOT (role IS DISTINCT FROM ( SELECT u.role
   FROM users u
  WHERE (u.id = (select auth.uid()))))) AND (NOT (balance IS DISTINCT FROM ( SELECT u.balance
   FROM users u
  WHERE (u.id = (select auth.uid())))))))$p$,
    $p$alter policy "Users can view their own profile" on public.users
  using (((select auth.uid()) = id))$p$
  ] loop
    begin
      execute s;
    exception when undefined_object or undefined_table then
      raise notice 'initplan rewrite skipped (object missing): %', left(s, 96);
    end;
  end loop;
end $init$;
