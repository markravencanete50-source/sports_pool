/*
 * ============================================================================
 * ZERO OUT THE REMAINING SECURITY-ADVISOR WARNINGS
 *
 * Companion to 20260807000000_close_stale_write_policies. That file fixed the
 * exploitable holes; this one clears what the Supabase security linter still
 * flags afterwards, without changing any app-visible behavior:
 *
 *   0028/0029 anon/authenticated_security_definer_function_executable on
 *     - is_admin / is_pool_participant / has_parlay_card_in_pool
 *       RLS helpers. Client roles MUST keep EXECUTE (policies evaluate them as
 *       the querying role — revoking it is the 42501 incident of 20260805000001)
 *       but they do NOT need to be API surface. Moving them to a non-exposed
 *       `private` schema removes their /rest/v1/rpc endpoints while policies
 *       keep working: policy expressions bind functions by OID, and
 *       ALTER FUNCTION ... SET SCHEMA preserves the OID.
 *     - guard_invitation_immutable / guard_pool_settlement_columns
 *       Trigger guards. Trigger firing never checks the DML caller's EXECUTE
 *       privilege (it is checked once, at CREATE TRIGGER time), so client
 *       EXECUTE is pure attack surface: revoke it.
 *
 * Plus grant hygiene the linter does not check but a security audit should:
 *   - TRUNCATE / REFERENCES / TRIGGER revoked from client roles everywhere.
 *     TRUNCATE in particular is NOT governed by RLS.
 *   - anon loses every table-level write privilege in public. The only anon
 *     write in the product is the newsletter signup, which runs on a COLUMN
 *     grant — insert(email) — and column grants are unaffected by table-level
 *     revokes, so it keeps working (asserted below).
 * ============================================================================
 */

-- ---------------------------------------------------------------------------
-- 1. Non-exposed schema for the RLS helpers
-- ---------------------------------------------------------------------------
create schema if not exists private;
comment on schema private is
  'Internal helpers (RLS predicates). Deliberately NOT in PostgREST''s exposed schemas: nothing here is API.';

revoke all on schema private from public;
-- USAGE is required for policy evaluation: helpers execute as the querying
-- role, and executing a function requires USAGE on its schema.
grant usage on schema private to anon, authenticated, service_role;

alter function public.is_admin()                          set schema private;
alter function public.is_pool_participant(uuid, uuid)     set schema private;
alter function public.has_parlay_card_in_pool(uuid, uuid) set schema private;

-- Policies reference the helpers by OID and follow the move automatically.
-- Function BODIES are text and do not: the two trigger guards call
-- public.is_admin() by name and must be repointed. Bodies are otherwise
-- verbatim from the live definitions.
create or replace function public.guard_invitation_immutable()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or private.is_admin() then
    return new;                                -- service-role / admin
  end if;
  if new.pool_id          is distinct from old.pool_id
     or new.invited_user_id is distinct from old.invited_user_id
     or new.invited_by      is distinct from old.invited_by then
    raise exception 'Invitation identity is immutable; you may only answer it';
  end if;
  if new.status not in ('accepted','declined') then
    raise exception 'An invitation may only be moved to accepted or declined';
  end if;
  return new;
end $$;

create or replace function public.guard_pool_settlement_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or private.is_admin() then
    return new;                                -- service-role / admin
  end if;
  if new.status               is distinct from old.status
     or new.entry_fee            is distinct from old.entry_fee
     or new.prize_pot            is distinct from old.prize_pot
     or new.participants         is distinct from old.participants
     or new.type                 is distinct from old.type
     or new.created_by           is distinct from old.created_by
     or new.week                 is distinct from old.week
     or new.season               is distinct from old.season
     or new.is_system_weekly_pool is distinct from old.is_system_weekly_pool then
    raise exception
      'Settlement and money fields are not user-editable (status, entry_fee, prize_pot, participants, type, created_by, week, season)';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Trigger functions are not API
-- ---------------------------------------------------------------------------
revoke execute on function public.guard_invitation_immutable()    from public, anon, authenticated;
revoke execute on function public.guard_pool_settlement_columns() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column()      from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2b. Attach the guard triggers
--
-- A guard function enforces nothing until it is wired to its table with CREATE
-- TRIGGER, and NO migration ever did that — the two functions above were only
-- ever defined, never attached. On a fresh build invariant (e) at the bottom of
-- this file then failed (it asserts both triggers exist), aborting `supabase db
-- reset` here and leaving the last two migrations un-applied. On the live
-- database the triggers had been wired up out of band, which is exactly the
-- schema/migration drift these files fight; committing the CREATE TRIGGER makes
-- a rebuilt database enforce the same rule the assertion demands. Idempotent so
-- it is safe whether or not the trigger already exists.
--
-- Both guards exempt service_role (auth.uid() is null) and admins, so every
-- server-side money path is unaffected; they only stop a client-scoped UPDATE
-- from touching settlement/identity columns that RLS column-grants already lock.
drop trigger if exists trg_guard_invitation_immutable on public.pool_invitations;
create trigger trg_guard_invitation_immutable
  before update on public.pool_invitations
  for each row execute function public.guard_invitation_immutable();

drop trigger if exists trg_guard_pool_settlement_columns on public.pools;
create trigger trg_guard_pool_settlement_columns
  before update on public.pools
  for each row execute function public.guard_pool_settlement_columns();

-- ---------------------------------------------------------------------------
-- 3. Grant hygiene
-- ---------------------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from public, anon, authenticated;
-- anon writes: nothing in the product writes as anon at the TABLE level.
revoke insert, update, delete on all tables in schema public from anon;
-- A table-level REVOKE also revokes same-type COLUMN grants (per the REVOKE
-- notes in the PostgreSQL docs) — the statement above therefore took the
-- newsletter signup's insert(email) with it. That is the one anon write the
-- product needs; restore exactly it. Invariant (d) below proves it is back.
grant insert (email) on public.newsletter_subscribers to anon;

-- ---------------------------------------------------------------------------
-- 4. Invariants — fail loudly rather than report success
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  -- (a) No SECURITY DEFINER function left in the exposed schema that a client
  --     role can execute. This is exactly what advisor lints 0028/0029 flag.
  --
  --     EXCEPTION — get_public_winners and claim_pool_payout are deliberately
  --     SECURITY DEFINER in public AND client-executable: they ARE the app's
  --     RPC surface (winners ticker / withdrawal claim), reached at
  --     /rest/v1/rpc, and they must run as definer to bypass RLS in a controlled
  --     way (claim moves a balance; the ticker reads pool_winners after its
  --     direct read policy was dropped). Both are safe — they derive identity
  --     from auth.uid(), pin search_path, and validate every path. Every OTHER
  --     SECURITY DEFINER helper was moved to `private` (is_admin,
  --     is_pool_participant, has_parlay_card_in_pool) or revoked from client
  --     roles (credit/debit_user_balance, the trigger guards), so the check
  --     still catches any NEW leak. Without this allowlist a fresh build aborted
  --     right here, because these two are created earlier by
  --     20260807000000_add_missing_rpcs and legitimately trip the raw check.
  select string_agg(p.proname, ', ' order by p.proname)
    into v_bad
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prosecdef
    and p.proname not in ('get_public_winners', 'claim_pool_payout')
    and (has_function_privilege('anon',          p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'SECURITY DEFINER functions in public still client-executable: %', v_bad;
  end if;

  -- (b) The helpers must remain executable by the client roles from their new
  --     home, or every policy that calls them starts failing with 42501.
  if not (has_function_privilege('anon', 'private.is_admin()', 'execute')
      and has_function_privilege('anon', 'private.is_pool_participant(uuid, uuid)', 'execute')
      and has_function_privilege('anon', 'private.has_parlay_card_in_pool(uuid, uuid)', 'execute')
      and has_function_privilege('authenticated', 'private.is_admin()', 'execute')
      and has_schema_privilege('anon', 'private', 'usage')
      and has_schema_privilege('authenticated', 'private', 'usage')) then
    raise exception 'RLS helpers lost client EXECUTE/USAGE after the schema move — policies would fail with 42501';
  end if;

  -- (c) anon holds no table-level write privilege anywhere in public.
  select string_agg(c.relname, ', ' order by c.relname)
    into v_bad
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind = 'r'
    and (has_table_privilege('anon', c.oid, 'insert')
      or has_table_privilege('anon', c.oid, 'update')
      or has_table_privilege('anon', c.oid, 'delete')
      or has_table_privilege('anon', c.oid, 'truncate'));
  if v_bad is not null then
    raise exception 'anon still holds table-level write privileges on: %', v_bad;
  end if;

  -- (d) The one legitimate anon write survives: newsletter signup's column grant.
  if not has_column_privilege('anon', 'public.newsletter_subscribers', 'email', 'insert') then
    raise exception 'newsletter_subscribers lost the anon insert(email) column grant — /api/newsletter/subscribe would 500';
  end if;

  -- (e) The guards are still wired up as triggers.
  if (select count(*) from pg_trigger t
      where not t.tgisinternal
        and t.tgfoid in ('public.guard_invitation_immutable()'::regprocedure,
                         'public.guard_pool_settlement_columns()'::regprocedure)) < 2 then
    raise exception 'trigger guards are no longer attached to their tables';
  end if;
end $$;
