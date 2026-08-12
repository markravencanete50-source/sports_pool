-- ============================================================================
-- AUDIT FOLLOW-UP HARDENING
--
-- Fixes from a fresh security + reliability review. Everything here is written
-- to be safe on BOTH a freshly-rebuilt database and the already-provisioned live
-- one (idempotent, create-or-replace, drop-if-exists), because the companion
-- change in 20260808000000_zero_security_advisors_private_helpers only re-runs
-- on a rebuild — this file carries the pieces the live database also needs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. get_public_winners must not leak PRIVATE-pool results  [privacy]
--
-- 20260808000000_final_audit_fixes dropped the direct anon read policy on
-- pool_winners specifically because it "additionally exposed private-pool
-- results", routing the public ticker through this RPC instead. But the RPC
-- itself filtered only on p.status = 'completed', never p.type, so it kept
-- handing back the winner name, avatar, amount and pool name for PRIVATE pools
-- to any unauthenticated caller of /rest/v1/rpc/get_public_winners. A public
-- ticker must only surface PUBLIC pools. Recreated authoritatively (not
-- if-not-exists) so the fix reaches the live database too.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_winners(p_limit integer default 10)
returns table(
  winner_id uuid,
  winner_name text,
  winner_avatar text,
  amount_won numeric,
  pool_name text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    pw.id as winner_id,
    u.name as winner_name,
    u.avatar as winner_avatar,
    pw.amount as amount_won,
    p.name as pool_name
  from public.pool_winners pw
  join public.pools p on p.id = pw.pool_id
  left join public.users u on u.id = pw.user_id
  where p.status = 'completed'
    and p.type = 'public'
  order by pw.created_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

grant execute on function public.get_public_winners(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Remove the duplicate, looser INSERT policy on pool_invitations
--
-- 20260807000000_close_stale created "Pool creator may invite to own pool"
-- (no self-invite guard). 20260808000000_final_audit_fixes created the stricter
-- "Pool owner invites only" (which adds invited_user_id <> auth.uid()) but only
-- dropped the older "Users can create invitations" / "Pool owner invites only"
-- names — it never dropped "Pool creator may invite to own pool". Postgres
-- permissive policies are OR-ed, so the looser one still let a creator
-- self-invite into their own pool, defeating the stricter policy's intent.
-- Impact is limited (own pool only), but the two policies contradict each other,
-- so drop the loose one and leave "Pool owner invites only" authoritative.
-- ---------------------------------------------------------------------------
drop policy if exists "Pool creator may invite to own pool" on public.pool_invitations;

-- ---------------------------------------------------------------------------
-- 3. platform_settings — remove the residual client write grant  [defense-in-depth]
--
-- RLS on platform_settings exposes only a SELECT policy, so an authenticated
-- write is already denied. But the table-level INSERT/UPDATE/DELETE grant to
-- `authenticated` was never revoked (the anon sweep in zero_security took only
-- anon). This table holds platform_fee_percentage and minimum_entry_fee, which
-- drive every payout, so a single future permissive policy added here would be
-- a direct money lever. Every legitimate write goes through service_role (RLS is
-- bypassed there), so revoking the client grant changes no working path.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.platform_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Attach the settlement/invitation guard triggers on the live database
--
-- 20260808000000_zero_security_advisors defines guard_pool_settlement_columns
-- and guard_invitation_immutable and (after this review) attaches them, but that
-- migration does not re-run on an already-provisioned database. Attach them here
-- idempotently so the live database enforces the same guards. Both exempt
-- service_role (auth.uid() is null) and admins, so no server-side path changes;
-- they only stop a client-scoped UPDATE from editing settlement/identity columns.
-- ---------------------------------------------------------------------------
-- NOTE the legacy name. The live database already carried a pools guard, but
-- under the out-of-band name `trg_guard_pool_settlement` — no repo migration
-- ever created that spelling. Dropping only the `..._columns` name would leave
-- the legacy trigger in place and add a second one beside it, so the guard
-- function would fire twice per UPDATE. Drop both spellings, then create
-- exactly one. (Verified after apply: pools carries a single guard trigger.)
drop trigger if exists trg_guard_invitation_immutable on public.pool_invitations;
create trigger trg_guard_invitation_immutable
  before update on public.pool_invitations
  for each row execute function public.guard_invitation_immutable();

drop trigger if exists trg_guard_pool_settlement         on public.pools;
drop trigger if exists trg_guard_pool_settlement_columns on public.pools;
create trigger trg_guard_pool_settlement_columns
  before update on public.pools
  for each row execute function public.guard_pool_settlement_columns();

-- ---------------------------------------------------------------------------
-- 5. Invariants — assert the end state rather than trust the statements above
-- ---------------------------------------------------------------------------
do $$
begin
  -- The public ticker filters to public pools.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_public_winners'
      and pg_get_functiondef(p.oid) not ilike '%p.type = ''public''%'
  ) then
    raise exception 'get_public_winners is not filtering to public pools';
  end if;

  -- The loose self-invite policy is gone.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pool_invitations'
      and policyname = 'Pool creator may invite to own pool'
  ) then
    raise exception 'the loose pool_invitations INSERT policy is still present';
  end if;

  -- authenticated holds no write grant on platform_settings.
  if has_table_privilege('authenticated', 'public.platform_settings', 'insert')
     or has_table_privilege('authenticated', 'public.platform_settings', 'update')
     or has_table_privilege('authenticated', 'public.platform_settings', 'delete') then
    raise exception 'authenticated still holds a write grant on platform_settings';
  end if;

  -- Both guard triggers are attached.
  if (select count(*) from pg_trigger t
      where not t.tgisinternal
        and t.tgfoid in ('public.guard_invitation_immutable()'::regprocedure,
                         'public.guard_pool_settlement_columns()'::regprocedure)) < 2 then
    raise exception 'guard triggers are not attached';
  end if;
end $$;
