-- ============================================================================
-- REVOKE CLIENT EXECUTE ON THE POOL-FINANCIALS RPCs  [information disclosure]
--
-- get_pool_financials(uuid) and get_pools_financials(uuid[]) are SECURITY
-- DEFINER and were executable by anon and authenticated, which exposes them at
-- /rest/v1/rpc/get_pool_financials and /rest/v1/rpc/get_pools_financials.
-- Anyone holding a pool id — a declined invitee, a former participant, anyone
-- a link leaked to — could read pot size, platform-fee totals and participant
-- counts for ANY pool, private pools included, without touching the app.
--
-- HOW THE GRANTS GOT HERE. 20260805000001 revoked EXECUTE on five helper
-- functions at once; the 20260805000002 hotfix then restored all five because
-- revoking helpers that RLS policies reference breaks every governed read
-- (42501 "permission denied for function"). That blanket restore was right for
-- three of the five and swept the other two along with it.
--
-- WHY THIS REVOKE IS SAFE, unlike 20260805000001:
--   * No RLS policy references either function. Verified live before writing
--     this: pg_policies has 0 rows whose qual or with_check mentions
--     get_pool_financials or get_pools_financials.
--   * Every application caller runs server-side on the service role, which
--     bypasses grants: src/lib/pool-financials.ts (createAdminClient),
--     src/lib/settle-pools.ts, and the /api/pools handlers that go through
--     them. Verified by grepping every rpc() call site.
--
-- The policy-referenced helpers (is_admin, is_pool_participant,
-- has_parlay_card_in_pool) are untouched. They have since moved to the
-- `private` schema — the permanent fix 20260805000002 anticipated: PostgREST
-- does not expose `private`, so they are unreachable at /rest/v1/rpc while
-- policies can still call them. They must KEEP client EXECUTE, because policy
-- expressions evaluate as the querying role — revoking them re-breaks every
-- governed read. That is the exact lesson of 20260805000002.
-- ============================================================================

revoke execute on function public.get_pool_financials(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_pools_financials(uuid[])
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invariant — assert the end state rather than trust the statements above.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.get_pool_financials(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_pool_financials(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_pools_financials(uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_pools_financials(uuid[])', 'EXECUTE') then
    raise exception 'pool-financials RPCs are still client-executable';
  end if;

  -- The policy-referenced helpers must stay callable, or every read their
  -- policies govern starts failing with 42501.
  if not has_function_privilege('authenticated', 'private.is_admin()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'private.is_pool_participant(uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'private.has_parlay_card_in_pool(uuid, uuid)', 'EXECUTE')
     or not has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'RLS helper functions lost EXECUTE; policy-governed reads would break';
  end if;
end $$;
