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

-- ---------------------------------------------------------------------------
-- The other two client-executable SECURITY DEFINER functions.
--
-- These were missed by the 14 August sweep because that sweep ran against a
-- database where 20260807000003 had never applied — one of the three migrations
-- silently skipped by the duplicate-version collision. On a database built
-- completely from these files, that migration DOES run and re-creates
-- public.is_admin(), so the function is present, client-executable, and was
-- undocumented. The gap was in the audited database, not in the reasoning.
-- ---------------------------------------------------------------------------
comment on function public.is_admin() is
  'SECURITY DEFINER by design (security-advisor exception). Reads the caller''s '
  'own role via auth.uid() so that RLS policies can ask "is this an admin?" '
  'without re-entering public.users and triggering 42P17 recursion — the same '
  'defect 20260812020000 fixed for the UPDATE policy. Takes no parameters, so a '
  'caller cannot ask about anyone but themselves. Client-executable because RLS '
  'policy expressions are evaluated as the CALLING role: revoking EXECUTE here '
  'fails every governed statement closed (learned in 20260805000001, reverted '
  'in 20260805000002).';

comment on function public.accept_terms(text) is
  'SECURITY DEFINER by design (security-advisor exception). Records acceptance '
  'of a specific terms version against the CALLER''s own row, deriving identity '
  'from auth.uid() rather than a parameter, so it cannot record consent on '
  'behalf of another account. Definer rights are required because user_compliance '
  'is not client-writable — consent must be recorded by the database, not '
  'asserted by the client that benefits from it.';

do $$
declare
  v_offenders text;
begin
  -- Invariant: every SECURITY DEFINER function exposed to anon or
  -- authenticated must carry a justification comment, so the security-advisor
  -- report is self-explanatory and a reviewer never has to guess which
  -- warnings are accepted. Fails the migration if one is exposed without one.
  --
  -- NAME THE OFFENDERS. The first version of this raised a bare message with no
  -- identifiers, which is close to useless: it fired during a client's
  -- provisioning run and gave no way to tell which of nineteen SECURITY DEFINER
  -- functions was at fault without hand-querying the catalogue. An invariant
  -- that says "something is wrong" without saying what is a puzzle, not a guard.
  select string_agg(format('%s.%s(%s)', n.nspname, p.proname,
                           pg_get_function_identity_arguments(p.oid)), ', '
                    order by p.proname)
    into v_offenders
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     and obj_description(p.oid) is null;

  if v_offenders is not null then
    raise exception
      'client-executable SECURITY DEFINER function(s) without a justification comment: %',
      v_offenders;
  end if;
end $$;
