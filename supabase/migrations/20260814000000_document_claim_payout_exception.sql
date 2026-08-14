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
-- accept_terms — the one client-executable SECURITY DEFINER function in public
-- that the 14 August sweep missed.
--
-- It was missed because that sweep ran against our production database, where
-- the compliance layer (20260812010000, which creates accept_terms) had only
-- just been applied and the sweep pre-dated it in practice. On a database built
-- completely from these files it is present, granted to authenticated, and was
-- undocumented — so the invariant below fires. The gap was in the audited
-- database's history, not in the reasoning.
--
-- NOTE ON is_admin, is_pool_participant, has_parlay_card_in_pool: these are also
-- SECURITY DEFINER, but 20260808000000 moves them to the `private` schema, which
-- PostgREST does not serve. They are therefore NOT client-executable public
-- functions and the invariant correctly ignores them. An earlier draft of this
-- migration tried to comment public.is_admin() and failed with 42883 — the
-- function does not exist under that name after the schema move. Verify the real
-- set with scripts/verify-provision.sql rather than assuming which schema a
-- helper ended up in.
-- ---------------------------------------------------------------------------
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
