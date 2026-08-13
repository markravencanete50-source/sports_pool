-- Document the one advisor-flagged SECURITY DEFINER function that carried no
-- in-database justification.
--
-- The repo's convention is that every function the Supabase security advisor
-- flags as client-executable carries a COMMENT saying why that is intentional,
-- so the advisor report is self-explanatory and a reviewer never has to guess
-- which warnings are accepted. The 14 August sweep found claim_pool_payout was
-- the only flagged function missing one — the function itself is correct
-- (auth.uid() identity, FOR UPDATE serialisation, ledger-authoritative
-- idempotency, atomic increment, unique-index backstop, pinned search_path);
-- only the documentation was absent.
--
-- Idempotent: COMMENT ON simply overwrites.

comment on function public.claim_pool_payout(uuid) is
  'SECURITY DEFINER by design (security-advisor exception). Identity comes from '
  'auth.uid(), never a parameter; the caller can only claim their OWN approved '
  'winnings. Concurrent claims serialise on a FOR UPDATE lock over the approval '
  'row, the ledger (user_transactions) is the authoritative already-claimed '
  'signal, and idx_user_transactions_winning_per_pool makes a double credit '
  'impossible even if both guards were bypassed. Credits balance atomically.';

do $$
begin
  -- Invariant: every SECURITY DEFINER function exposed to anon or
  -- authenticated must now carry a justification comment. Fails the migration
  -- if a future function is exposed without one.
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
            or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       and obj_description(p.oid) is null
  ) then
    raise exception 'client-executable SECURITY DEFINER function without a justification comment';
  end if;
end $$;
