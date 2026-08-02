-- Compute pool prize pot, paid count, and total players from transactions + parlay_cards
-- prize_pot = sum of completed payment amounts
-- paid_participant_count = distinct users who paid
-- total_players = distinct users who have at least one card (pending/active/completed)

create or replace function public.get_pool_financials(p_pool_id uuid)
returns table(prize_pot numeric, paid_participant_count integer, total_players integer)
language sql
security definer
set search_path = ''
stable
as $$
  select
    coalesce((select sum(amount) from public.pool_transactions where pool_id = p_pool_id and status = 'completed'), 0)::numeric as prize_pot,
    coalesce((select count(distinct user_id) from public.pool_transactions where pool_id = p_pool_id and status = 'completed'), 0)::integer as paid_participant_count,
    coalesce((select count(distinct user_id) from public.parlay_cards where pool_id = p_pool_id and status in ('pending', 'active', 'completed')), 0)::integer as total_players;
$$;

comment on function public.get_pool_financials(uuid) is
  'Returns computed prize_pot, paid_participant_count (distinct payers), and total_players (distinct users with cards) for a pool.';

-- Batch version: one row per pool_id so every pool gets prize_pot, paid_participant_count, total_players
create or replace function public.get_pools_financials(pool_ids uuid[])
returns table(pool_id uuid, prize_pot numeric, paid_participant_count integer, total_players integer)
language sql
security definer
set search_path = ''
stable
as $$
  select
    p.id as pool_id,
    coalesce(pt.prize_pot, 0)::numeric as prize_pot,
    coalesce(pt.paid_count, 0)::integer as paid_participant_count,
    coalesce(pc.total_players, 0)::integer as total_players
  from unnest(pool_ids) as p(id)
  left join (
    select pool_id, sum(amount) as prize_pot, count(distinct user_id) as paid_count
    from public.pool_transactions where status = 'completed'
    group by pool_id
  ) pt on pt.pool_id = p.id
  left join (
    select pool_id, count(distinct user_id)::integer as total_players
    from public.parlay_cards where status in ('pending', 'active', 'completed')
    group by pool_id
  ) pc on pc.pool_id = p.id;
$$;

comment on function public.get_pools_financials(uuid[]) is
  'Returns computed prize_pot, paid_participant_count, and total_players per pool for the given pool IDs.';
