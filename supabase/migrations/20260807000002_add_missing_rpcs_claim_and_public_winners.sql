-- ============================================================================
-- MISSING RPCs — reproducibility fix
--
-- src/app/api/me/claim-payout/route.ts calls public.claim_pool_payout(p_pool_id)
-- and src/app/api/winners/route.ts calls public.get_public_winners(p_limit), but
-- NEITHER function was ever committed to a migration (they were applied to the
-- live database out of band). A database rebuilt from these migrations was
-- therefore missing both, so the withdrawal-claim flow and the public winners
-- ticker 500'd on any fresh/rebuilt environment.
--
-- IMPORTANT — these definitions are RECONSTRUCTED from the call sites and table
-- schemas, and are created ONLY IF THE FUNCTION DOES NOT ALREADY EXIST. On the
-- live database (which already has the authoritative versions) the CREATE is
-- skipped, so this migration cannot clobber production behaviour; it only fills
-- the gap on a fresh rebuild. To make the committed definition authoritative,
-- dump the live one with pg_get_functiondef(...) and replace the body below.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- get_public_winners — read-only public ticker of winners in COMPLETED pools.
-- Returns pool_winners.id (a stable key), never the user's UUID.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_public_winners'
  ) then
    execute $ddl$
      create function public.get_public_winners(p_limit integer default 10)
      returns table(
        winner_id uuid,
        winner_name text,
        winner_avatar text,
        amount_won numeric,
        pool_name text
      )
      language sql
      security definer
      set search_path = ''
      stable
      as $fn$
        select
          pw.id as winner_id,
          u.name as winner_name,
          u.avatar as winner_avatar,
          pw.amount as amount_won,
          p.name as pool_name
        from public.pool_winners pw
        join public.pools p on p.id = pw.pool_id
        left join public.users u on u.id = pw.user_id
        where p.status = 'completed'
        order by pw.created_at desc nulls last
        limit greatest(1, least(coalesce(p_limit, 10), 100));
      $fn$;
    $ddl$;
  end if;
end $$;

-- Public ticker: readable by logged-out visitors and members alike.
grant execute on function public.get_public_winners(integer) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- claim_pool_payout — credit an approved winning into the caller's balance,
-- as ONE transaction. Identity comes from auth.uid(), never a client argument.
-- Outcome codes match the FAILURES map in claim-payout/route.ts.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_pool_payout'
  ) then
    execute $ddl$
      create function public.claim_pool_payout(p_pool_id uuid)
      returns table(
        outcome text,
        previous_balance numeric,
        amount_credited numeric,
        final_balance numeric
      )
      language plpgsql
      security definer
      set search_path = ''
      as $fn$
      declare
        v_uid   uuid := auth.uid();
        v_appr  public.payout_approvals%rowtype;
        v_prev  numeric;
        v_final numeric;
      begin
        if v_uid is null then
          return query select 'unauthenticated'::text, null::numeric, null::numeric, null::numeric;
          return;
        end if;

        -- Serialise concurrent claims on the approval row.
        select * into v_appr
        from public.payout_approvals
        where pool_id = p_pool_id and user_id = v_uid
        for update;

        if not found then
          if exists (
            select 1 from public.pool_winners
            where pool_id = p_pool_id and user_id = v_uid
          ) then
            return query select 'no_approval'::text, null::numeric, null::numeric, null::numeric;
          else
            return query select 'not_winner'::text, null::numeric, null::numeric, null::numeric;
          end if;
          return;
        end if;

        if v_appr.status = 'claimed' then
          return query select 'already_claimed'::text, null::numeric, null::numeric, null::numeric;
          return;
        end if;

        if v_appr.amount is null or v_appr.amount <= 0 then
          return query select 'invalid_amount'::text, null::numeric, null::numeric, null::numeric;
          return;
        end if;

        -- If settlement already credited this pool's winning, don't double-credit.
        if exists (
          select 1 from public.user_transactions
          where user_id = v_uid and pool_id = p_pool_id and type = 'winning_approved'
        ) then
          update public.payout_approvals
          set status = 'claimed', claimed_at = now()
          where id = v_appr.id;
          return query select 'already_claimed'::text, null::numeric, null::numeric, null::numeric;
          return;
        end if;

        -- Credit atomically: move by a relative amount under a row lock, never an
        -- absolute write computed before the lock.
        select balance into v_prev from public.users where id = v_uid for update;
        v_prev := coalesce(v_prev, 0);
        v_final := v_prev + v_appr.amount;

        begin
          insert into public.user_transactions(
            user_id, admin_id, previous_balance, amount, final_balance,
            type, reference_type, reference_id, pool_id, comment
          )
          values (
            v_uid, null, v_prev, v_appr.amount, v_final,
            'winning_approved', 'payout_approval', v_appr.id, p_pool_id, null
          );
        exception when unique_violation then
          -- A concurrent settlement won the race: it credited already.
          update public.payout_approvals
          set status = 'claimed', claimed_at = now()
          where id = v_appr.id;
          return query select 'already_claimed'::text, null::numeric, null::numeric, null::numeric;
          return;
        end;

        update public.users set balance = v_final where id = v_uid;

        update public.payout_approvals
        set status = 'claimed', claimed_at = now()
        where id = v_appr.id;

        return query select 'credited'::text, v_prev, v_appr.amount, v_final;
      end;
      $fn$;
    $ddl$;
  end if;
end $$;

-- Claiming requires a session; the function derives the claimant from auth.uid().
grant execute on function public.claim_pool_payout(uuid) to authenticated;
