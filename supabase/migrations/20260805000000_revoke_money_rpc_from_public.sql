-- ============================================================================
-- CRITICAL: the money-moving RPCs were still callable by anon.
--
-- 20260804000000 did:
--     revoke all on function public.credit_user_balance(uuid, numeric)
--       from anon, authenticated;
--
-- That removes the two explicit role grants but NOT the implicit grant Postgres
-- gives to PUBLIC on every new function. The resulting ACL was:
--     =X/postgres | postgres=X/postgres | service_role=X/postgres
--      ^ PUBLIC still holds EXECUTE
-- and has_function_privilege('anon', ..., 'EXECUTE') returned true.
--
-- Supabase exposes every public-schema function at /rest/v1/rpc/<name>, so an
-- unauthenticated caller with the anon key from the JS bundle could POST
--     {"p_user_id": "<any uuid>", "p_amount": 999999}
-- to /rest/v1/rpc/credit_user_balance and mint an arbitrary balance, then
-- withdraw it through the normal payout flow.
--
-- Revoking from PUBLIC is the only thing that actually closes it.
--
-- Lesson worth keeping: `revoke ... from anon, authenticated` reads like it
-- locks a function down and does not. Always assert with
-- has_function_privilege() afterwards, as the DO block at the bottom does.
-- ============================================================================
revoke all on function public.credit_user_balance(uuid, numeric) from public, anon, authenticated;
revoke all on function public.debit_user_balance(uuid, numeric)  from public, anon, authenticated;

-- Trigger function: fires in the table owner's context, so callers never need
-- EXECUTE. Exposed as an RPC it is just attack surface.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- NOTE — deliberately NOT revoked: is_admin(), is_pool_participant(),
-- has_parlay_card_in_pool(). These are invoked inside RLS policy predicates,
-- which are evaluated as the querying role, so revoking EXECUTE would make
-- every select on pools/pool_games/comments fail with "permission denied for
-- function". They leak only booleans. Moving them to a non-exposed schema is
-- the proper fix and is tracked separately.

-- Pin the search_path on the one function still missing it (advisor 0011).
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'public.credit_user_balance(uuid, numeric)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.credit_user_balance(uuid, numeric)', 'EXECUTE')
     or has_function_privilege('anon', 'public.debit_user_balance(uuid, numeric)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.debit_user_balance(uuid, numeric)', 'EXECUTE')
  then
    raise exception 'Balance RPCs are still executable by anon/authenticated. Refusing to apply.';
  end if;
end $$;
