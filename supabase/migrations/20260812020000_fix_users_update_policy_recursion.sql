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
-- ---------------------------------------------------------------------------
do $$
declare
  u uuid := '00000000-0000-4000-8000-0000000f1c00';
  ok_name boolean := false;
  blocked_role boolean := false;
begin
  insert into public.users (id, email, name, balance)
  values (u, 'policy-invariant@example.invalid', 'Before', 0)
  on conflict (id) do update set name = 'Before', balance = 0, role = 'user';

  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- The legitimate path must now work.
  begin
    update public.users set name = 'After' where id = u;
    ok_name := true;
  exception when others then
    ok_name := false;
  end;

  -- Privilege escalation must still be refused.
  begin
    update public.users set role = 'admin' where id = u;
    blocked_role := false;
  exception when others then
    blocked_role := true;
  end;

  reset role;
  delete from public.users where id = u;

  if not ok_name then
    raise exception 'FAIL: a user still cannot update their own name';
  end if;
  if not blocked_role then
    raise exception 'FAIL: role escalation is no longer blocked';
  end if;
end $$;
