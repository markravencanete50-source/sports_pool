-- REVERT of 20260805000001 for the RLS helper functions.
--
-- 20260805000001 assumed a policy expression is evaluated in the table owner's
-- context and so needs no EXECUTE from the querying role. That is FALSE.
-- Postgres raised, as soon as anon touched a table governed by such a policy:
--     42501: permission denied for function has_parlay_card_in_pool
-- Revoking EXECUTE on a function referenced by RLS breaks every read that
-- policy governs. Verified by re-running the same query after this migration:
-- anon reads games=49, teams=32 again.
--
-- The remaining WARN lints are accepted for now. The correct way to clear them
-- is to move these helpers into a schema PostgREST does not expose, so they are
-- unreachable at /rest/v1/rpc while still callable from policies. Doing that
-- means recreating every policy that references them, so it is tracked
-- separately rather than bundled into a hotfix.
grant execute on function public.is_admin()                          to anon, authenticated;
grant execute on function public.is_pool_participant(uuid, uuid)     to anon, authenticated;
grant execute on function public.has_parlay_card_in_pool(uuid, uuid) to anon, authenticated;
grant execute on function public.get_pool_financials(uuid)           to anon, authenticated;
grant execute on function public.get_pools_financials(uuid[])        to anon, authenticated;

-- sync_profile_from_user is not referenced by any policy, so it stays revoked.
