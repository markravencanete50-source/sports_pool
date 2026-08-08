/*
 * ============================================================================
 * LOCK CLIENT INSERT/DELETE ON pools AND pool_games
 *
 * 20260807000000 (sections 2 and 7) left INSERT/DELETE on these two tables
 * grantable to `authenticated`, because two routes still wrote them with the
 * caller's client:
 *   - /api/pools/[poolId]  PATCH (slate edit) and DELETE (pool delete)
 *   - /api/sync/nfl-games   POST  (weekly public pool + slate creation)
 *
 * Both now perform every pools/pool_games INSERT/DELETE with
 * createAdminClient() (service role), so the authenticated grant is pure attack
 * surface. Revoke it. The exploit was already closed by RLS — the admin-only
 * INSERT/DELETE policies on both tables — this removes the underlying privilege
 * as well, so a future stray permissive policy cannot silently re-open it.
 *
 * NOT touched:
 *   - UPDATE(name, max_participants) on pools — the creator-edit path still
 *     writes the pool name with the user client, gated by "Creator may edit own
 *     pool" + the column grant. Verified present below.
 *   - service_role grants — it performs every real write now. Verified below.
 *
 * Idempotent; safe to run twice. The `from public` targets the inheritance trap
 * documented in 20260805000000_revoke_money_rpc_from_public.
 * ============================================================================
 */

revoke insert, delete on public.pool_games from public, anon, authenticated;
revoke insert, delete on public.pools      from public, anon, authenticated;

do $$
declare
  v_bad text := '';
begin
  -- The whole point: authenticated can no longer INSERT/DELETE either table.
  if has_table_privilege('authenticated', 'public.pools', 'INSERT')
     then v_bad := v_bad || 'authenticated can INSERT pools; '; end if;
  if has_table_privilege('authenticated', 'public.pools', 'DELETE')
     then v_bad := v_bad || 'authenticated can DELETE pools; '; end if;
  if has_table_privilege('authenticated', 'public.pool_games', 'INSERT')
     then v_bad := v_bad || 'authenticated can INSERT pool_games; '; end if;
  if has_table_privilege('authenticated', 'public.pool_games', 'DELETE')
     then v_bad := v_bad || 'authenticated can DELETE pool_games; '; end if;
  if has_table_privilege('anon', 'public.pools', 'INSERT')
     or has_table_privilege('anon', 'public.pool_games', 'INSERT')
     then v_bad := v_bad || 'anon can still write pools/pool_games; '; end if;

  -- The creator-edit path (user client) must keep UPDATE(name) on pools.
  if not has_column_privilege('authenticated', 'public.pools', 'name', 'UPDATE')
     then v_bad := v_bad || 'authenticated lost UPDATE(name) on pools — creator edit would break; '; end if;

  -- The service role does every real write now; it must keep full access.
  if not (has_table_privilege('service_role', 'public.pools', 'INSERT')
      and has_table_privilege('service_role', 'public.pools', 'DELETE')
      and has_table_privilege('service_role', 'public.pool_games', 'INSERT')
      and has_table_privilege('service_role', 'public.pool_games', 'DELETE'))
     then v_bad := v_bad || 'service_role lost a required write grant on pools/pool_games; '; end if;

  if v_bad <> '' then
    raise exception 'pools/pool_games client-write lockdown invariant violated — %. Refusing to apply.', v_bad;
  end if;
end $$;
