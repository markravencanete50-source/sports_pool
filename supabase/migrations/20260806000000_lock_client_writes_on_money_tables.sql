/*
 * Close the remaining client-side write paths that bypass the API entirely.
 *
 * Context: every hardening pass so far fixed API routes. But the browser ships
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, so any authenticated user can talk straight to
 * PostgREST and skip every route handler. At that layer the only defences are
 * RLS policies and table grants — and both were still permissive on the tables
 * that decide who gets paid.
 *
 * Verified against the live database before writing (pg_policies +
 * information_schema.role_table_grants), not inferred from the source tree.
 *
 * Two Postgres facts drive the whole file:
 *   1. An UPDATE policy with USING but no WITH CHECK validates the row as it
 *      was, never as it will be. The new values are unchecked.
 *   2. RLS cannot restrict which COLUMNS an UPDATE touches. Only column-level
 *      GRANTs can. A with_check of `auth.uid() = created_by` happily permits
 *      `set status = 'completed'`.
 */

-- ---------------------------------------------------------------------------
-- 1. parlay_cards — a card is a paid financial instrument
-- ---------------------------------------------------------------------------
-- Live policies granted users INSERT, UPDATE and DELETE on their own cards, so
-- via PostgREST a user could:
--   * INSERT a card with status 'active' and never pay Stripe (free entry),
--   * UPDATE pool_id to move a cheap card into an expensive pool — buy in at
--     $20, then repoint the card at the $100 pool and play for its pot,
--   * UPDATE entry_fee_paid to misstate what was actually paid,
--   * DELETE a losing card before settlement.
-- Cards are only ever created by fulfillCardPurchase(), which both callers
-- (/api/stripe/webhook and /api/stripe/confirm-payment) invoke with
-- createAdminClient() — service role bypasses RLS, so removing the client-side
-- INSERT/DELETE policies cannot break purchase. Confirmed by reading both call
-- sites before dropping these.
drop policy if exists "Users can insert own parlay_cards" on public.parlay_cards;
drop policy if exists "Users can delete own parlay_cards" on public.parlay_cards;

-- Redundant duplicate of "Card holder only"; both are user_id = auth.uid(), so
-- dropping it changes nothing but removes a second policy that a future edit
-- could loosen without anyone noticing. Permissive policies OR together.
drop policy if exists "Users can read own parlay_cards" on public.parlay_cards;

-- The card stays editable only while pending. USING freezes it the moment it
-- leaves 'pending'; WITH CHECK allows exactly one transition out — the
-- pending -> active lock that /cards/[cardId]/lock performs with a user-scoped
-- client. 'completed' is settlement's word, never the client's.
drop policy if exists "Users can update own parlay_cards" on public.parlay_cards;
create policy "Card editable while pending" on public.parlay_cards
  for update
  using      (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status in ('pending', 'active'));

-- The policy above constrains user_id and status, but — same column blindness
-- as pools — says nothing about pool_id, entry_fee_paid or card_number. Lock
-- them with grants. The only user-scoped write to this table is the lock
-- transition in /cards/[cardId]/lock, which sets status and updated_at.
revoke update on public.parlay_cards from authenticated, anon;
grant update (status, updated_at) on public.parlay_cards to authenticated;

-- ---------------------------------------------------------------------------
-- 2. card_picks — two escapes from the kickoff lock
-- ---------------------------------------------------------------------------
-- (a) UPDATE had USING but no WITH CHECK. USING tested the OLD row, so a pick
--     on a still-scheduled game passed the gate, and the NEW row was never
--     validated: the user could rewrite game_id to a game that had already
--     finished, with the result known. The kickoff lock was bypassable by
--     editing the pick rather than creating one.
drop policy if exists "Card picks updatable before kickoff" on public.card_picks;
create policy "Card picks updatable before kickoff" on public.card_picks
  for update
  using (
    exists (select 1 from public.parlay_cards c
            where c.id = card_picks.card_id
              and c.user_id = auth.uid()
              and c.status = 'pending')
    and exists (select 1 from public.games g
                where g.id = card_picks.game_id
                  and g.date > now()
                  and g.status = 'scheduled')
  )
  with check (
    exists (select 1 from public.parlay_cards c
            where c.id = card_picks.card_id
              and c.user_id = auth.uid()
              and c.status = 'pending')
    and exists (select 1 from public.games g
                where g.id = card_picks.game_id
                  and g.date > now()
                  and g.status = 'scheduled')
  );

-- (b) DELETE carried no kickoff condition at all — only ownership. A player
--     could drop a pick after the game went against them. Whether that helps
--     depends on how scoring counts picks, which is exactly why it must not be
--     reachable. Same window as editing.
drop policy if exists "Users can delete picks for own cards" on public.card_picks;
create policy "Picks deletable before kickoff" on public.card_picks
  for delete
  using (
    exists (select 1 from public.parlay_cards c
            where c.id = card_picks.card_id
              and c.user_id = auth.uid()
              and c.status = 'pending')
    and exists (select 1 from public.games g
                where g.id = card_picks.game_id
                  and g.date > now()
                  and g.status = 'scheduled')
  );

-- ---------------------------------------------------------------------------
-- 3. pool_invitations — unconstrained UPDATE defeated the join fix
-- ---------------------------------------------------------------------------
-- The INSERT policy was correctly tightened to "pool creator invites only", but
-- UPDATE was `using (auth.uid() = invited_user_id)` with with_check NULL. So an
-- invitee holding ONE legitimate invitation could rewrite that row's pool_id to
-- any private pool and set status='accepted' — and pool_participants' INSERT
-- policy trusts exactly that row. The private-pool fix was walkable around.
-- NOTE: the obvious fix — re-asserting pool_id against the stored row inside
-- WITH CHECK — cannot be used. A subquery on pool_invitations inside a policy
-- ON pool_invitations is itself subject to that policy, and Postgres aborts
-- with "infinite recursion detected in policy for relation". Column-level
-- grants achieve the same immutability without the self-reference, and match
-- how section 4 handles pools.
drop policy if exists "Users can update own invitations" on public.pool_invitations;
create policy "Invitee may only answer" on public.pool_invitations
  for update
  using      (auth.uid() = invited_user_id)
  with check (auth.uid() = invited_user_id
              and status in ('accepted', 'declined'));

revoke update on public.pool_invitations from authenticated, anon;
-- status is the only column an invitee may move. pool_id and invited_user_id
-- are now unwritable by any client, so the row cannot be repointed at another
-- pool no matter what the policy allows.
grant update (status) on public.pool_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- 4. pools — RLS cannot stop a column write; grants can
-- ---------------------------------------------------------------------------
-- "Creator may edit own pool" is using/with_check `auth.uid() = created_by`,
-- which says nothing about WHICH columns move. The creator could PATCH
-- status='completed' to force early settlement over a partial slate (the
-- winnings route materialises winners from finished games only), or raise
-- prize_pot, or flip type to expose a private pool.
revoke update on public.pools from authenticated, anon;
-- Give back only what a pool owner legitimately edits.
grant update (name, max_participants) on public.pools to authenticated;

-- ---------------------------------------------------------------------------
-- 5. anon must never write
-- ---------------------------------------------------------------------------
-- Blanket INSERT/UPDATE/DELETE was granted to anon on these tables. RLS
-- currently denies it for want of a permissive policy, which means one careless
-- future policy is all that stands between an anonymous request and the prize
-- tables. Remove the privilege so a policy alone can never be enough.
revoke insert, update, delete on public.pools             from anon;
revoke insert, update, delete on public.pool_invitations  from anon;
revoke insert, update, delete on public.parlay_cards      from anon;
revoke insert, update, delete on public.pool_winners      from anon;
revoke insert, update, delete on public.card_picks        from anon;
revoke insert, update, delete on public.pool_participants from anon;

-- pool_winners and payout_approvals are written only by settlement running as
-- service role; no authenticated write is ever legitimate.
revoke insert, update, delete on public.pool_winners     from authenticated;
revoke insert, update, delete on public.payout_approvals from authenticated, anon;
