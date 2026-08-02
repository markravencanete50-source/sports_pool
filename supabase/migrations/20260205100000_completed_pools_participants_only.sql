-- Completed pools: only visible to users who participated (have a parlay_card in that pool)
-- or to the pool creator.

create or replace function public.has_parlay_card_in_pool(p_pool_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.parlay_cards
    where pool_id = p_pool_id
      and user_id = p_user_id
      and status in ('pending', 'active', 'completed')
  );
$$;

drop policy if exists "Users can view pools they created or participate in" on public.pools;

create policy "Users can view pools they created or participate in" on public.pools
  for select using (
    (
      (pools.status <> 'completed')
      or (pools.created_by = auth.uid())
      or public.has_parlay_card_in_pool(pools.id, auth.uid())
    )
    and (
      (pools.type = 'public')
      or (pools.created_by = auth.uid())
      or public.is_pool_participant(pools.id, auth.uid())
    )
  );