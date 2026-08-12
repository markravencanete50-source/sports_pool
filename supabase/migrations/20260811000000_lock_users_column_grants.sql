-- ============================================================================
-- LOCK THE CLIENT'S UPDATE SURFACE ON public.users  [defense-in-depth]
--
-- balance and role are currently unwritable by a client, but ONLY because of the
-- WITH CHECK on the "Users can update own profile" policy added in
-- 20260804000000, which re-reads both columns and requires them unchanged.
-- `authenticated` still holds a TABLE-WIDE UPDATE grant on public.users, so that
-- single predicate is the only thing standing between a normal account and
-- writing its own balance or promoting itself to admin.
--
-- That is too little for the two most dangerous columns in the schema. RLS
-- cannot restrict WHICH columns an UPDATE touches — only grants can — and this
-- is the same reasoning already applied to pools (20260806000000) and
-- parlay_cards, where the table grant was narrowed to specific columns.
--
-- Safe to apply: every users UPDATE in the application runs with the SERVICE
-- ROLE, which bypasses grants and RLS entirely —
--   * /api/admin/users/[userId]/role  -> createAdminClient()
--   * lib/seed-admin.ts               -> createAdminClient()
-- and the money paths move balance through SECURITY DEFINER functions
-- (credit_user_balance, debit_user_balance, claim_pool_payout), which execute as
-- the function owner rather than the caller. No user-scoped UPDATE on this table
-- exists in the codebase. Verified by grepping every .from("users").update()
-- call site before writing this.
--
-- (name, avatar) is kept granted so a profile-edit screen keeps working, and so
-- trg_sync_profile — which fires on update of name/avatar to mirror them into
-- public.profiles — still has a path to fire.
-- ============================================================================

revoke update on public.users from anon, authenticated;
grant  update (name, avatar) on public.users to authenticated;

-- ---------------------------------------------------------------------------
-- Invariant — assert the end state rather than trust the statements above.
-- ---------------------------------------------------------------------------
do $$
begin
  -- The dangerous columns must not be client-writable at the grant level.
  if has_column_privilege('authenticated', 'public.users', 'balance', 'UPDATE') then
    raise exception 'authenticated can still UPDATE users.balance';
  end if;
  if has_column_privilege('authenticated', 'public.users', 'role', 'UPDATE') then
    raise exception 'authenticated can still UPDATE users.role';
  end if;
  if has_column_privilege('authenticated', 'public.users', 'email', 'UPDATE') then
    raise exception 'authenticated can still UPDATE users.email';
  end if;

  -- anon must hold no UPDATE at all.
  if has_table_privilege('anon', 'public.users', 'UPDATE') then
    raise exception 'anon still holds UPDATE on public.users';
  end if;

  -- The profile-edit path must survive.
  if not has_column_privilege('authenticated', 'public.users', 'name', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.users', 'avatar', 'UPDATE') then
    raise exception 'authenticated lost UPDATE(name, avatar) — profile editing would break';
  end if;

  -- service_role performs every real write; it must keep full UPDATE.
  if not has_table_privilege('service_role', 'public.users', 'UPDATE') then
    raise exception 'service_role lost UPDATE on public.users — admin role changes and settlement would break';
  end if;
end $$;
