-- ============================================================================
-- RECONCILE REPO <-> LIVE DATABASE STATE (handover prep, 2026-08-12)
--
-- The live database received six migrations out of band (via the management
-- API, under timestamp versions disjoint from these files):
--   fix_rls_scoping_and_settlement_guards, security_hardening_anon_reads_and_
--   legacy_picks, perf_foreign_key_indexes_and_dedupe, add_get_public_winners_
--   rpc, add_claim_pool_payout_rpc, fix_pool_financials_grants_and_record_
--   platform_fee
-- while 20260807000003_final_audit_fixes.sql (renamed from 20260808000000 so
-- it orders before zero_security_advisors, whose ALTER FUNCTION ... SET SCHEMA
-- repoints its policies) was committed here but never applied live.
--
-- This migration is IDEMPOTENT and closes the gap in BOTH directions:
--   * live gains the final_audit pieces it is missing (pool fee lock, the
--     pool-locked fee recording trigger, the profiles display-name FKs the API
--     embed hints require);
--   * a fresh rebuild gains the live-only pieces (authoritative RPC bodies,
--     the 5-column financials RPCs plus the grants that fix the "$0 prize
--     pot" bug, the covering/FK indexes).
--
-- After this file and 20260812090000_handover_hardening.sql, a database built
-- from these migrations matches the live schema. The one-off history repair
-- for the ALREADY-provisioned production database is documented in HANDOVER.md.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- A. Pool fee lock (final_audit §1 — was missing on live)
--    Every pool locks its platform fee percentage at creation; clients can
--    never assert it. Settlement and fee recording read the locked value.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.pools
  add column if not exists platform_fee_percentage numeric;

-- Repair anything stored outside the valid range before constraining.
update public.pools
   set platform_fee_percentage = 10
 where platform_fee_percentage < 0
    or platform_fee_percentage > 100;

create or replace function public.set_pool_platform_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pct numeric;
begin
  -- Unconditional: never trust an incoming value for this column.
  select ps.platform_fee_percentage
    into v_pct
  from public.platform_settings ps
  order by ps.updated_at desc nulls last
  limit 1;

  new.platform_fee_percentage := least(greatest(coalesce(v_pct, 10), 0), 100);

  return new;
end;
$$;

revoke all on function public.set_pool_platform_fee() from public, anon, authenticated;

drop trigger if exists trg_set_pool_platform_fee on public.pools;
create trigger trg_set_pool_platform_fee
  before insert on public.pools
  for each row execute function public.set_pool_platform_fee();

alter table public.pools
  drop constraint if exists pools_platform_fee_percentage_range;
alter table public.pools
  add constraint pools_platform_fee_percentage_range
  check (platform_fee_percentage is null
         or (platform_fee_percentage >= 0 and platform_fee_percentage <= 100));


-- ─────────────────────────────────────────────────────────────────────────────
-- B. Recorded per-sale fee uses the pool's LOCKED rate (final_audit §2 —
--    live still had the global-rate version, so a mid-season fee change would
--    make recorded revenue disagree with the split settlement actually pays).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_pool_transaction_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pct numeric;
begin
  select p.platform_fee_percentage
    into v_pct
  from public.pools p
  where p.id = new.pool_id;

  if v_pct is null then
    select ps.platform_fee_percentage
      into v_pct
    from public.platform_settings ps
    order by ps.updated_at desc nulls last
    limit 1;
  end if;

  v_pct := least(greatest(coalesce(v_pct, 10), 0), 100);

  new.platform_fee := round(coalesce(new.amount, 0) * v_pct / 100.0, 2);
  new.net_amount   := coalesce(new.amount, 0) - new.platform_fee;

  return new;
end;
$$;

-- Trigger functions are invoked by the trigger machinery, never by clients.
revoke all on function public.set_pool_transaction_fee() from public, anon, authenticated;

drop trigger if exists trg_set_pool_transaction_fee on public.pool_transactions;
create trigger trg_set_pool_transaction_fee
  before insert on public.pool_transactions
  for each row execute function public.set_pool_transaction_fee();


-- ─────────────────────────────────────────────────────────────────────────────
-- C. Display-name foreign keys (final_audit §6b — MISSING ON LIVE while the
--    API actively disambiguates embeds with these exact constraint names, e.g.
--    profiles!pool_participants_user_id_profiles_fkey in /api/pools. Without
--    them PostgREST rejects the embed and the pools/chat endpoints fail.)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comments_user_id_profiles_fkey') then
    alter table public.comments
      add constraint comments_user_id_profiles_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'pool_participants_user_id_profiles_fkey') then
    alter table public.pool_participants
      add constraint pool_participants_user_id_profiles_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'pools_created_by_profiles_fkey') then
    alter table public.pools
      add constraint pools_created_by_profiles_fkey
      foreign key (created_by) references public.profiles(id) on delete cascade;
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- D. Authoritative RPC bodies, dumped from the live database
--    (pg_get_functiondef). 20260807000002_add_missing_rpcs creates guarded
--    reconstructions on a fresh rebuild; these replace them with the audited
--    live versions so every environment runs identical code.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_public_winners(p_limit integer default 10)
returns table(winner_id uuid, winner_name text, winner_avatar text, amount_won numeric, pool_name text)
language sql
stable security definer
set search_path to ''
as $function$
  select w.id,
         u.name,
         u.avatar,
         w.amount,
         p.name
  from public.pool_winners w
  join public.pools p on p.id = w.pool_id
  join public.users u on u.id = w.user_id
  where p.status = 'completed'
  order by w.amount desc, w.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$function$;

create or replace function public.claim_pool_payout(p_pool_id uuid)
returns table(outcome text, previous_balance numeric, amount_credited numeric, final_balance numeric)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user      uuid := auth.uid();
  v_approved  timestamptz;
  v_appr_id   uuid;
  v_appr_amt  numeric;
  v_appr_by   uuid;
  v_appr_cmt  text;
  v_appr_st   text;
  v_before    numeric;
  v_after     numeric;
begin
  if v_user is null then
    return query select 'unauthenticated'::text, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  -- 1. Caller must actually be a winner of this pool, and approved.
  select w.approved_at into v_approved
    from public.pool_winners w
   where w.pool_id = p_pool_id and w.user_id = v_user
   limit 1;

  if not found then
    return query select 'not_winner'::text, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  if v_approved is null then
    return query select 'not_approved'::text, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  -- 2. Lock the approval row. Concurrent claims serialise here: the second
  --    caller waits, then re-reads and sees status = 'claimed'.
  --    payout_approvals_user_id_pool_id_key guarantees at most one row.
  select a.id, a.amount, a.approved_by, a.comment, a.status
    into v_appr_id, v_appr_amt, v_appr_by, v_appr_cmt, v_appr_st
    from public.payout_approvals a
   where a.user_id = v_user and a.pool_id = p_pool_id
   for update;

  if not found then
    return query select 'no_approval'::text, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  -- 3. Already settled? The ledger is the authoritative "money moved" signal;
  --    the status flag can lag it if the old non-atomic path died in between.
  if v_appr_st = 'claimed'
     or exists (select 1
                  from public.user_transactions t
                 where t.user_id = v_user
                   and t.pool_id = p_pool_id
                   and t.type    = 'winning_approved') then

    -- Self-heal an approval the previous implementation left un-marked.
    update public.payout_approvals
       set status     = 'claimed',
           claimed_at = coalesce(claimed_at, now())
     where id = v_appr_id and status <> 'claimed';

    select u.balance into v_before from public.users u where u.id = v_user;
    return query select 'already_claimed'::text, v_before, 0::numeric, v_before;
    return;
  end if;

  if v_appr_amt is null or v_appr_amt <= 0 then
    return query select 'invalid_amount'::text, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  -- 4. Atomic increment. Never `balance = <value read earlier>`.
  update public.users u
     set balance = u.balance + v_appr_amt
   where u.id = v_user
  returning u.balance into v_after;

  v_before := v_after - v_appr_amt;

  -- idx_user_transactions_winning_per_pool remains the backstop: if anything
  -- slips past the lock, this insert raises 23505 and the whole claim rolls
  -- back, including the credit above.
  insert into public.user_transactions (
    user_id, admin_id, previous_balance, amount, final_balance,
    type, reference_type, reference_id, pool_id, comment
  ) values (
    v_user, v_appr_by, v_before, v_appr_amt, v_after,
    'winning_approved', 'payout_approval', v_appr_id, p_pool_id, v_appr_cmt
  );

  update public.payout_approvals
     set status = 'claimed', claimed_at = now()
   where id = v_appr_id;

  return query select 'credited'::text, v_before, v_appr_amt, v_after;
end;
$function$;

-- The financials RPCs changed return shape (3 -> 5 columns) out of band, and
-- CREATE OR REPLACE cannot change a return type, so drop-and-recreate.
drop function if exists public.get_pool_financials(uuid);
create function public.get_pool_financials(p_pool_id uuid)
returns table(prize_pot numeric, paid_participant_count integer, total_players integer, platform_fee numeric, net_prize_pot numeric)
language sql
stable security definer
set search_path to ''
as $function$
  select
    coalesce((select sum(amount) from public.pool_transactions
               where pool_id = p_pool_id and status = 'completed'), 0)::numeric,
    coalesce((select count(distinct user_id) from public.pool_transactions
               where pool_id = p_pool_id and status = 'completed'), 0)::integer,
    coalesce((select count(distinct user_id) from public.parlay_cards
               where pool_id = p_pool_id
                 and status in ('pending','active','completed')), 0)::integer,
    coalesce((select sum(platform_fee) from public.pool_transactions
               where pool_id = p_pool_id and status = 'completed'), 0)::numeric,
    coalesce((select sum(net_amount) from public.pool_transactions
               where pool_id = p_pool_id and status = 'completed'), 0)::numeric;
$function$;

drop function if exists public.get_pools_financials(uuid[]);
create function public.get_pools_financials(pool_ids uuid[])
returns table(pool_id uuid, prize_pot numeric, paid_participant_count integer, total_players integer, platform_fee numeric, net_prize_pot numeric)
language sql
stable security definer
set search_path to ''
as $function$
  select
    p.id,
    coalesce(pt.gross, 0)::numeric,
    coalesce(pt.paid_count, 0)::integer,
    coalesce(pc.total_players, 0)::integer,
    coalesce(pt.fee, 0)::numeric,
    coalesce(pt.net, 0)::numeric
  from unnest(pool_ids) as p(id)
  left join (
    select pool_id,
           sum(amount)              as gross,
           sum(platform_fee)        as fee,
           sum(net_amount)          as net,
           count(distinct user_id)  as paid_count
    from public.pool_transactions
    where status = 'completed'
    group by pool_id
  ) pt on pt.pool_id = p.id
  left join (
    select pool_id, count(distinct user_id)::integer as total_players
    from public.parlay_cards
    where status in ('pending','active','completed')
    group by pool_id
  ) pc on pc.pool_id = p.id;
$function$;

-- Grants. WHY anon: the logged-out lobby (/public-pools) and marketing pages
-- legitimately render pot sizes for active public pools, and the winners
-- ticker is public by design. Both were dark ("$0 prize pot" bug) when these
-- grants were missing. claim_pool_payout requires a session and derives the
-- claimant from auth.uid(); anon gains nothing from it and is revoked in
-- 20260812090000_handover_hardening.
grant execute on function public.get_public_winners(integer)  to anon, authenticated;
grant execute on function public.claim_pool_payout(uuid)      to authenticated;
grant execute on function public.get_pool_financials(uuid)    to anon, authenticated, service_role;
grant execute on function public.get_pools_financials(uuid[]) to anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- E. Covering / foreign-key indexes (perf_foreign_key_indexes_and_dedupe was
--    live-only). IF NOT EXISTS makes every line a no-op where it already
--    exists. Legacy `picks` indexes are omitted — the table is dropped in
--    20260812090000_handover_hardening.
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_card_picks_card                 on public.card_picks using btree (card_id);
create index if not exists idx_card_picks_game                 on public.card_picks using btree (game_id);
create index if not exists idx_comments_pool                   on public.comments using btree (pool_id);
create index if not exists idx_comments_user                   on public.comments using btree (user_id);
create index if not exists idx_games_away_team                 on public.games using btree (away_team_id);
create index if not exists idx_games_date                      on public.games using btree (date);
create index if not exists idx_games_home_team                 on public.games using btree (home_team_id);
create index if not exists idx_games_status                    on public.games using btree (status);
create index if not exists idx_games_week                      on public.games using btree (week);
create index if not exists idx_notifications_created_at        on public.notifications using btree (created_at desc);
create index if not exists idx_notifications_type              on public.notifications using btree (type);
create index if not exists idx_notifications_user_id           on public.notifications using btree (user_id);
create index if not exists idx_notifications_user_unread       on public.notifications using btree (user_id, read_at) where (read_at is null);
create index if not exists idx_parlay_cards_pool               on public.parlay_cards using btree (pool_id);
create index if not exists idx_parlay_cards_pool_user          on public.parlay_cards using btree (pool_id, user_id);
create index if not exists idx_parlay_cards_status             on public.parlay_cards using btree (status);
create index if not exists idx_payout_approvals_approved_by    on public.payout_approvals using btree (approved_by);
create index if not exists idx_payout_approvals_pool           on public.payout_approvals using btree (pool_id);
create index if not exists idx_payout_approvals_status         on public.payout_approvals using btree (status);
create index if not exists idx_payout_approvals_user           on public.payout_approvals using btree (user_id);
create index if not exists idx_payout_requests_pool            on public.payout_requests using btree (pool_id);
create index if not exists idx_payout_requests_processed_by    on public.payout_requests using btree (processed_by);
create index if not exists idx_payout_requests_status          on public.payout_requests using btree (status);
create index if not exists idx_payout_requests_user            on public.payout_requests using btree (user_id);
create index if not exists idx_platform_settings_updated_by    on public.platform_settings using btree (updated_by);
create index if not exists idx_pool_games_game                 on public.pool_games using btree (game_id);
create index if not exists idx_pool_invitations_invited_by     on public.pool_invitations using btree (invited_by);
create index if not exists idx_pool_invitations_invited_user   on public.pool_invitations using btree (invited_user_id);
create index if not exists idx_pool_participants_pool          on public.pool_participants using btree (pool_id);
create index if not exists idx_pool_participants_user          on public.pool_participants using btree (user_id);
create index if not exists idx_pool_transactions_card          on public.pool_transactions using btree (card_id);
create index if not exists idx_pool_transactions_payment_id    on public.pool_transactions using btree (payment_id);
create index if not exists idx_pool_transactions_pool          on public.pool_transactions using btree (pool_id);
create index if not exists idx_pool_transactions_user          on public.pool_transactions using btree (user_id);
create index if not exists idx_pool_winners_approved           on public.pool_winners using btree (approved_at) where (approved_at is null);
create index if not exists idx_pool_winners_approved_by        on public.pool_winners using btree (approved_by);
create index if not exists idx_pool_winners_card               on public.pool_winners using btree (winning_card_id);
create index if not exists idx_pool_winners_pool               on public.pool_winners using btree (pool_id);
create index if not exists idx_pool_winners_user               on public.pool_winners using btree (user_id);
create index if not exists idx_pools_created_by                on public.pools using btree (created_by);
create index if not exists idx_pools_is_system_weekly_week_id  on public.pools using btree (is_system_weekly_pool, week_id) where (is_system_weekly_pool = true);
create index if not exists idx_pools_status                    on public.pools using btree (status);
create index if not exists idx_pools_type                      on public.pools using btree (type);
create index if not exists idx_pools_week                      on public.pools using btree (week);
create index if not exists idx_pools_week_season               on public.pools using btree (week, season);
create index if not exists idx_user_payout_accounts_user       on public.user_payout_accounts using btree (user_id);
create index if not exists idx_user_transactions_admin         on public.user_transactions using btree (admin_id);
create index if not exists idx_user_transactions_created       on public.user_transactions using btree (created_at desc);
create index if not exists idx_user_transactions_pool          on public.user_transactions using btree (pool_id);
create index if not exists idx_user_transactions_user          on public.user_transactions using btree (user_id);
