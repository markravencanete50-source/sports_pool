-- ============================================================================
-- ERROR CAPTURE TABLE + SELECT-POLICY CONSOLIDATION
--
-- 1. app_errors: server-side sink for application errors (client boundary
--    reports and server-side money-path failures), so failures reach an
--    operator through a queryable table instead of dying in a log buffer.
--
-- 2. Consolidate the duplicate permissive SELECT policies the performance
--    advisor flags on five tables. Postgres OR-es permissive policies, so
--    "admin sees all" + "owner sees own" as two policies means BOTH are
--    evaluated on every read. Folding the admin predicate into the owner
--    policy halves the policy evaluations without changing who can see what.
--
-- Idempotent; safe on both a fresh rebuild and the live database.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. app_errors
--
-- RLS is enabled and NO policies are created: clients can neither read nor
-- write it. Every write goes through the service role (the /api/client-errors
-- route and server-side recordAppError()), which bypasses RLS. Reads are for
-- operators via the dashboard / service role only — error records routinely
-- contain internals that must not be exposed through the public API.
-- ---------------------------------------------------------------------------
create table if not exists public.app_errors (
  id         uuid primary key default gen_random_uuid(),
  source     text not null check (source in ('client', 'server')),
  digest     text,
  message    text not null check (char_length(message) <= 2000),
  url        text check (url is null or char_length(url) <= 500),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  user_id    uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.app_errors enable row level security;

revoke all on public.app_errors from public, anon, authenticated;

create index if not exists idx_app_errors_created_at
  on public.app_errors (created_at desc);

-- Covers the user_id FK: a user deletion (ON DELETE SET NULL) must not scan.
create index if not exists idx_app_errors_user_id
  on public.app_errors (user_id);

comment on table public.app_errors is
  'Application error sink (client boundary reports + server money-path failures). '
  'Service-role only by design: no RLS policies, no client grants. Retention: '
  'purged by the reconcile cron after 90 days.';

-- ---------------------------------------------------------------------------
-- 2. One SELECT policy per table instead of two
--
-- The admin arm uses private.is_admin() — the same table-authoritative helper
-- the rest of the schema uses — rather than repeating the EXISTS(...users...)
-- subquery some of these policies carried.
-- ---------------------------------------------------------------------------

-- users: fold "Admins can view all profiles" into the own-profile policy.
drop policy if exists "Admins can view all profiles" on public.users;
drop policy if exists "Users can view their own profile" on public.users;
create policy "Users can view their own profile" on public.users
  for select using (((select auth.uid()) = id) or private.is_admin());

-- user_transactions
drop policy if exists "Admin can view all transactions" on public.user_transactions;
drop policy if exists "Users can view own transactions" on public.user_transactions;
create policy "Users can view own transactions" on public.user_transactions
  for select using (((select auth.uid()) = user_id) or private.is_admin());

-- user_payout_accounts
drop policy if exists "Admin can view all payout accounts" on public.user_payout_accounts;
drop policy if exists "Users can view own payout account" on public.user_payout_accounts;
create policy "Users can view own payout account" on public.user_payout_accounts
  for select using (((select auth.uid()) = user_id) or private.is_admin());

-- payout_requests: "Own payout requests" already contains the is_admin() arm,
-- so only the redundant admin policy needs to go.
drop policy if exists "Admin can view all payout requests" on public.payout_requests;

-- payout_approvals
drop policy if exists "Admin can view all payout approvals" on public.payout_approvals;
drop policy if exists "Users can view own payout approvals" on public.payout_approvals;
create policy "Users can view own payout approvals" on public.payout_approvals
  for select using (((select auth.uid()) = user_id) or private.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Invariants — assert the end state rather than trust the statements above
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  n integer;
begin
  -- app_errors is locked to the service role.
  if not exists (
    select 1 from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'app_errors' and c.relrowsecurity
  ) then
    raise exception 'app_errors exists without row level security';
  end if;

  if has_table_privilege('authenticated', 'public.app_errors', 'select')
     or has_table_privilege('authenticated', 'public.app_errors', 'insert')
     or has_table_privilege('anon', 'public.app_errors', 'select')
     or has_table_privilege('anon', 'public.app_errors', 'insert') then
    raise exception 'app_errors is reachable by a client role';
  end if;

  -- Exactly one permissive SELECT policy per consolidated table.
  foreach t in array array['users', 'user_transactions', 'user_payout_accounts',
                           'payout_requests', 'payout_approvals'] loop
    select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = t
      and cmd = 'SELECT' and permissive = 'PERMISSIVE';
    if n <> 1 then
      raise exception 'expected exactly 1 SELECT policy on %, found %', t, n;
    end if;
  end loop;
end $$;
