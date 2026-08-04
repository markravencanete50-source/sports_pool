-- Attempt to clear the WARN-level *_security_definer_function_executable lints
-- by removing EXECUTE from the public REST surface.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default and anon /
-- authenticated inherit it, so revoking per-role alone is a no-op.
revoke execute on function public.is_admin()                          from public, anon, authenticated;
revoke execute on function public.is_pool_participant(uuid, uuid)     from public, anon, authenticated;
revoke execute on function public.has_parlay_card_in_pool(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.get_pool_financials(uuid)           from public, anon, authenticated;
revoke execute on function public.get_pools_financials(uuid[])        from public, anon, authenticated;
revoke execute on function public.sync_profile_from_user()            from public, anon, authenticated;

grant execute on function public.is_admin()                          to service_role;
grant execute on function public.is_pool_participant(uuid, uuid)     to service_role;
grant execute on function public.has_parlay_card_in_pool(uuid, uuid) to service_role;
grant execute on function public.get_pool_financials(uuid)           to service_role;
grant execute on function public.get_pools_financials(uuid[])        to service_role;
