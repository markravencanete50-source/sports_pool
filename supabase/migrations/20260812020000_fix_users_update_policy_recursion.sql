-- ============================================================================
-- FIX: "infinite recursion detected in policy for relation users"
--
-- Found by the adversarial role-impersonation suite run against the live
-- database on 2026-08-12. Two attacks (escalate own role, credit own balance)
-- were refused — but with a RECURSION ERROR rather than by the control that was
-- supposed to refuse them. A block that happens by accident is not a control,
-- and the same error also breaks the legitimate path.
--
-- THE DEFECT. The UPDATE policy added in 20260804000000 reads:
--
--   with check (
--     auth.uid() = id
--     and role    is not distinct from (select u.role    from public.users u where u.id = auth.uid())
--     and balance is not distinct from (select u.balance from public.users u where u.id = auth.uid())
--   )
--
-- Those subqueries SELECT from public.users, so evaluating the UPDATE policy
-- requires evaluating the SELECT policy on the very same table, which Postgres
-- refuses as recursive. The intent was right — pin role and balance so an
-- UPDATE cannot move them — but the implementation re-enters the table.
--
-- CONSEQUENCE. Every UPDATE on public.users by a client role raises, including
-- the fully-granted, entirely legitimate ones: a user changing their display
-- name or avatar. It went unnoticed because the database has no real users yet
-- and no profile-edit screen exercises it. It would have surfaced as a hard
-- failure on the first day of real traffic.
--
-- THE FIX. Read the current row through SECURITY DEFINER helpers, which run as
-- the definer and therefore do NOT re-enter the table's policies. The invariant
-- is unchanged; only the way the comparison value is fetched changes.
--
-- Note the defence in depth this preserves: column grants already stop an
-- ordinary client updating role or balance at all (20260811000000). This policy
-- is the second lock, and it now actually turns. Both are kept, because grants
-- and policies fail in different ways and a money table deserves both.
-- ============================================================================

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.role from public.users u where u.id = (select auth.uid());
$$;

create or replace function private.current_user_balance()
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.balance from public.users u where u.id = (select auth.uid());
$$;

comment on function private.current_user_role() is
  'SECURITY DEFINER so the users UPDATE policy can compare against the stored '
  'role without re-entering the users SELECT policy, which Postgres rejects as '
  'recursive. Lives in the private schema, so it is not reachable over PostgREST.';
comment on function private.current_user_balance() is
  'SECURITY DEFINER counterpart to private.current_user_role(); same reason.';

-- EXECUTE must be granted to the querying roles.
--
-- A policy expression is evaluated as the CALLING role, not as the table owner,
-- so revoking EXECUTE on a function a policy references breaks every statement
-- that policy governs. This repository learned that the hard way in
-- 20260805000001 and reverted it in 20260805000002 ("permission denied for
-- function has_parlay_card_in_pool"), and the first draft of this migration
-- walked straight back into it — the invariant block below caught it.
--
-- Exposure is contained by the SCHEMA, not by the grant: PostgREST only serves
-- the schemas it is configured with, and `private` is not one of them, so these
-- are callable from a policy but not reachable at /rest/v1/rpc. That is the
-- same arrangement the other private helpers use.
revoke all on function private.current_user_role()    from public;
revoke all on function private.current_user_balance() from public;
grant execute on function private.current_user_role()    to anon, authenticated;
grant execute on function private.current_user_balance() to anon, authenticated;

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile" on public.users
  for update
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role    is not distinct from private.current_user_role()
    and balance is not distinct from private.current_user_balance()
  );

-- ---------------------------------------------------------------------------
-- Invariants — prove the fix, rather than assume it
--
-- WHY THIS IS A CATALOGUE CHECK AND NOT A BEHAVIOURAL ONE.
--
-- The first version of this block did the honest thing: insert a fixture row,
-- SET LOCAL ROLE authenticated, attempt a legitimate rename and an illegitimate
-- role escalation, then RESET ROLE and delete the fixture. It passed against the
-- live database, where it was applied over an existing connection as an
-- already-privileged role.
--
-- It then FAILED the first time the migrations were applied to an empty database
-- through `supabase db push`, with 42501 permission denied for table users. The
-- CLI provisions its own dedicated login role ("Initialising login role..."), and
-- under that role the fixture cleanup after RESET ROLE no longer had the rights
-- the block assumed. 20260811000000 revokes table-wide UPDATE and grants only
-- (name, avatar) to authenticated, and grants no DELETE at all — so the block
-- was one role-restoration assumption away from aborting the whole provision.
--
-- The lesson generalises: a migration must apply under ANY role the deployment
-- tooling chooses. A self-test that assumes a role, sheds it, and then needs
-- elevated rights back has coupled the schema to one particular connection. That
-- is a bad trade — it converts a correct schema change into a provisioning
-- failure, which is exactly what happened here, on a client's database, during
-- handover.
--
-- So the structural guarantees are asserted from the catalogue, which is
-- role-independent and needs no fixture rows. The BEHAVIOURAL assertion — that a
-- real authenticated session can rename itself but cannot escalate — has not been
-- dropped; it moved to scripts/verify-provision.sql, which runs against a
-- provisioned database where impersonation is safe and a failure blocks nothing.
-- ---------------------------------------------------------------------------
do $$
declare
  v_recursive boolean;
  v_helpers   integer;
begin
  -- 1. The recursion itself. An UPDATE policy whose WITH CHECK reads from
  --    public.users re-enters that table's SELECT policy, which Postgres refuses
  --    with 42P17 — breaking every profile edit, not just the malicious ones.
  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'users'
      and cmd        = 'UPDATE'
      and coalesce(with_check, '') ~* '(from|join)[[:space:]]+(public\.)?users'
  ) into v_recursive;

  if v_recursive then
    raise exception
      'FAIL: the users UPDATE policy still reads from public.users — that is the 42P17 recursion this migration exists to remove';
  end if;

  -- 2. The grant this fix depends on. Policy expressions are evaluated as the
  --    CALLING role, so if authenticated loses EXECUTE on these helpers the
  --    policy fails closed and every legitimate profile edit is refused. This
  --    repository has made that exact mistake twice (20260805000001, and the
  --    first draft of this file), which is why it is asserted rather than
  --    trusted.
  select count(*) into v_helpers
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('current_user_role', 'current_user_balance')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if v_helpers <> 2 then
    raise exception
      'FAIL: authenticated holds EXECUTE on % of the 2 private helpers the users UPDATE policy calls; the policy would fail closed for every profile edit', v_helpers;
  end if;
end $$;
