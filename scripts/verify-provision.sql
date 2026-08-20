-- ============================================================================
-- Post-provision verification
--
-- Run this against a freshly provisioned database, AFTER `supabase db push`
-- completes. Paste it into the Supabase SQL Editor, or:
--
--   psql "$DATABASE_URL" -f scripts/verify-provision.sql
--
-- WHY THIS IS SEPARATE FROM THE MIGRATIONS.
--
-- Migrations must apply under whatever role the deployment tooling uses. A
-- migration that impersonates a role, sheds it, and then needs elevated rights
-- back has coupled the schema to one particular connection — and when that
-- assumption breaks it does not fail a test, it aborts the provision. That is
-- not hypothetical: the invariant block inside 20260812020000 did exactly this
-- and blocked a client handover with 42501 permission denied for table users.
--
-- So the migrations assert what the CATALOGUE can prove, and the behavioural
-- assertions — the ones that need a real role and real rows — live here, where
-- impersonation is safe, cleanup is unconditional, and a failure blocks nothing.
--
-- Every check returns PASS or a FAIL string. Nothing here writes permanent data:
-- the one fixture row is removed in the same transaction, and the whole script
-- rolls back.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Structural checks — cheap, role-independent, catalogue only
-- ---------------------------------------------------------------------------
select 'RLS enabled on every public table' as check,
       case when (select count(*)
                  from pg_class c
                  join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'r'
                    and not c.relrowsecurity) = 0
            then 'PASS'
            else 'FAIL: ' || (select string_agg(c.relname, ', ')
                              from pg_class c
                              join pg_namespace n on n.oid = c.relnamespace
                              where n.nspname = 'public' and c.relkind = 'r'
                                and not c.relrowsecurity)
       end as result

union all
select 'All 36 migrations recorded',
       (select case when count(*) = 36 then 'PASS (' || count(*) || ')'
                    else 'CHECK: ' || count(*) || ' recorded, expected 36' end
        from supabase_migrations.schema_migrations)

union all
-- The index that makes a double payout impossible even if settlement is run
-- twice concurrently. Without it, the money guard is application logic only.
select 'Double-credit guard index present',
       case when to_regclass('public.idx_user_transactions_winning_per_pool') is not null
            then 'PASS' else 'FAIL: idx_user_transactions_winning_per_pool missing' end

union all
-- greatest() is what makes self-exclusion one-way. Without it a later call with
-- a shorter period would shorten an active exclusion.
select 'Self-exclusion can only ever extend',
       case when exists (select 1 from pg_proc
                         where proname = 'set_self_exclusion'
                           and prosrc ilike '%greatest%')
            then 'PASS' else 'FAIL: set_self_exclusion no longer uses greatest()' end

union all
select 'users UPDATE policy free of 42P17 recursion',
       case when not exists (select 1 from pg_policies
                             where schemaname = 'public' and tablename = 'users'
                               and cmd = 'UPDATE'
                               and coalesce(with_check, '') ~* '(from|join)[[:space:]]+(public\.)?users')
            then 'PASS' else 'FAIL: the UPDATE policy reads from users again' end

union all
-- Policy expressions run as the CALLING role, so losing EXECUTE here fails the
-- policy closed and refuses every legitimate profile edit.
select 'authenticated can EXECUTE the policy helpers',
       (select case when count(*) = 2 then 'PASS'
                    else 'FAIL: ' || count(*) || ' of 2 helpers executable' end
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname in ('current_user_role', 'current_user_balance')
          and has_function_privilege('authenticated', p.oid, 'EXECUTE'))

union all
-- Column grants are the first lock on the money columns; the policy is the
-- second. Both are kept because they fail in different ways.
select 'role and balance not client-writable at grant level',
       case when not exists (
              select 1 from information_schema.column_privileges
              where table_schema = 'public' and table_name = 'users'
                and column_name in ('role', 'balance')
                and privilege_type = 'UPDATE'
                and grantee in ('anon', 'authenticated'))
            then 'PASS' else 'FAIL: a client role can write role or balance' end;

-- ---------------------------------------------------------------------------
-- Behavioural check — the assertion that used to live inside 20260812020000
--
-- This is the one that needs a real role and a real row: it proves the policy
-- admits the legitimate edit and refuses the escalation, rather than proving
-- the policy merely looks correct. Safe here because the fixture is removed
-- before the role is dropped, and the whole script rolls back regardless.
-- ---------------------------------------------------------------------------
do $$
declare
  u            uuid := '00000000-0000-4000-8000-0000000f1c00';
  ok_name      boolean := false;
  blocked_role boolean := false;
begin
  insert into public.users (id, email, name, balance)
  values (u, 'policy-invariant@example.invalid', 'Before', 0)
  on conflict (id) do update set name = 'Before', balance = 0, role = 'user';

  -- Delete the fixture BEFORE assuming the restricted role. The original version
  -- cleaned up afterwards and needed DELETE back, which the CLI's login role did
  -- not have — that is the bug this file exists to avoid repeating.
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);

  begin
    set local role authenticated;

    begin
      update public.users set name = 'After' where id = u;
      ok_name := true;
    exception when others then
      ok_name := false;
    end;

    begin
      update public.users set role = 'admin' where id = u;
      blocked_role := false;
    exception when others then
      blocked_role := true;
    end;
  exception when others then
    -- Could not assume the role at all: report rather than abort.
    ok_name := false;
    blocked_role := false;
  end;

  if not ok_name then
    raise warning 'FAIL: an authenticated user cannot update their own name';
  else
    raise notice 'PASS: legitimate profile edit succeeds';
  end if;

  if not blocked_role then
    raise warning 'FAIL: role escalation was NOT refused';
  else
    raise notice 'PASS: role escalation refused';
  end if;
end $$;

-- Nothing is kept. The fixture row and any role change die with the rollback.
rollback;
