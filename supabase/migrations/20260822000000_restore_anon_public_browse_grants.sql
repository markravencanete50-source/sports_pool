-- ============================================================================
-- RESTORE THE ANONYMOUS PUBLIC-BROWSE READ SURFACE  [production bug fix]
--
-- GET /api/pools — a deliberately public, no-auth endpoint (see the security
-- note at the top of src/app/api/pools/route.ts and the API table in
-- README.md) — has been returning
--
--     400 {"error":"permission denied for table pool_participants"}
--
-- to every anonymous caller in production. The route embeds
--   pool_participants(user_id, users:profiles!...(id, name, avatar))
-- through the RLS (anon-key) client, and on the live database the anon role
-- holds NO table grant on pool_participants and NO grant or SELECT policy on
-- profiles. A signed-in visitor is unaffected (authenticated kept both), which
-- is why the break went unnoticed: logged-out browsing — the marketing funnel
-- and /public-pools — is exactly the surface nobody was testing while signed in.
--
-- This is live-state drift, not a repo regression. No migration in this
-- directory ever revoked anon SELECT on either table: 20260806000000 revoked
-- only INSERT/UPDATE/DELETE on pool_participants, and 20260805000000 revoked
-- only writes on profiles while creating "Profiles are publicly readable"
-- (also present in 20260807000000's expected-policy table). A hardening pass
-- applied directly to the live database (recorded there as
-- security_hardening_anon_reads_and_legacy_picks, 2026-08-08) revoked the
-- anon read surface underneath the deployed code.
--
-- Restoring it is safe by construction:
--   * profiles carries only (id, name, avatar, updated_at) — it exists as the
--     public projection of users precisely so display identity can be shown
--     without touching users (email/role/balance), which stays own-row only.
--   * pool_participants rows remain bounded by RLS: the SELECT policy exposes
--     membership of PUBLIC pools only, unless the caller is the creator or a
--     participant. Grants decide table access; the policy still decides rows.
-- ============================================================================

grant select on public.pool_participants to anon;
grant select on public.profiles to anon;

-- Same drift on comments, with a different failure: GET /api/pools/[poolId]
-- (also public) embeds comments(...), and without the table grant the whole
-- select errors and the route answers 404 — every public pool's detail page
-- vanishes for logged-out visitors. Chat stays private regardless: the
-- "Chat readable by card holders" SELECT policy matches no rows for anon, so
-- this grant only lets the embed resolve to an empty list instead of an error.
grant select on public.comments to anon;

-- And the policy itself needs this one: "Chat readable by card holders"
-- (20260804000000) tests entitlement with INLINE `exists (select 1 from
-- parlay_cards ...)` subqueries, which run as the QUERYING role — unlike the
-- private.* helpers on pools/pool_games, which are SECURITY DEFINER. So merely
-- evaluating the comments policy as anon requires a table grant on
-- parlay_cards, or the read fails with 42501 instead of "no rows". (This is
-- also why the failure was plan-dependent: a predicate the planner
-- short-circuits never executes.) The "Card holder only" SELECT policy on
-- parlay_cards is `auth.uid() = user_id`, which matches nothing for anon, so
-- the grant exposes zero rows — it only lets the policy finish evaluating.
grant select on public.parlay_cards to anon;

-- The live database replaced the repo's public-read policy with an
-- authenticated-only one ("Profiles readable by signed-in users"). Converge
-- both provisioning paths on the repo's intended policy. Drop-then-create
-- rather than create-if-absent, so a fresh database (where the public policy
-- already exists) and the live one (where the signed-in variant exists) end
-- up byte-identical.
drop policy if exists "Profiles readable by signed-in users" on public.profiles;
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

-- ---------------------------------------------------------------------------
-- Invariant — assert the end state rather than trust the statements above.
-- ---------------------------------------------------------------------------
do $$
begin
  if not has_table_privilege('anon', 'public.pool_participants', 'SELECT') then
    raise exception 'anon must be able to SELECT pool_participants (public pool browse)';
  end if;
  if not has_table_privilege('anon', 'public.profiles', 'SELECT') then
    raise exception 'anon must be able to SELECT profiles (public display identity)';
  end if;
  if not has_table_privilege('anon', 'public.comments', 'SELECT') then
    raise exception 'anon must be able to SELECT comments (pool detail embed; RLS hides rows)';
  end if;
  if not has_table_privilege('anon', 'public.parlay_cards', 'SELECT') then
    raise exception 'anon must be able to SELECT parlay_cards (comments policy inline subquery; RLS hides rows)';
  end if;
  -- Writes must stay locked: this migration widens reads only.
  if has_table_privilege('anon', 'public.pool_participants', 'INSERT')
     or has_table_privilege('anon', 'public.profiles', 'INSERT')
     or has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.comments', 'INSERT')
     or has_table_privilege('anon', 'public.parlay_cards', 'INSERT')
     or has_table_privilege('anon', 'public.parlay_cards', 'UPDATE') then
    raise exception 'anon write access appeared where only SELECT was granted';
  end if;
end $$;
