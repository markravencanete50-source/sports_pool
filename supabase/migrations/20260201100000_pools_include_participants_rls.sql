-- Allow users to see private pools they were invited to and accepted (they are in pool_participants)
-- Uses SECURITY DEFINER function to avoid infinite recursion in RLS policies

create or replace function public.is_pool_participant(p_pool_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pool_participants
    where pool_id = p_pool_id and user_id = p_user_id
  );
$$;

drop policy if exists "Public pools are viewable by everyone" on public.pools;
drop policy if exists "Users can view pools they created or participate in" on public.pools;

create policy "Users can view pools they created or participate in" on public.pools
    for select using (
        (type = 'public')
        or (created_by = auth.uid())
        or public.is_pool_participant(id, auth.uid())
    );

-- pool_games: allow participants to see games
drop policy if exists "Pool games are viewable by pool members" on public.pool_games;

create policy "Pool games are viewable by pool members" on public.pool_games
    for select using (
        exists (
            select 1 from public.pools p
            where p.id = pool_games.pool_id
            and (
                (p.type = 'public')
                or (p.created_by = auth.uid())
                or public.is_pool_participant(p.id, auth.uid())
            )
        )
    );

-- pool_participants: allow participants to see other participants
drop policy if exists "Pool participants are viewable by pool participants" on public.pool_participants;

create policy "Pool participants are viewable by pool participants" on public.pool_participants
    for select using (
        exists (
            select 1 from public.pools p
            where p.id = pool_participants.pool_id
            and (
                (p.type = 'public')
                or (p.created_by = auth.uid())
            )
        )
        or public.is_pool_participant(pool_id, auth.uid())
    );

-- picks: allow participants to see picks
drop policy if exists "Picks are viewable by pool participants" on public.picks;

create policy "Picks are viewable by pool participants" on public.picks
    for select using (
        exists (
            select 1 from public.pools p
            where p.id = picks.pool_id
            and (
                (p.type = 'public')
                or (p.created_by = auth.uid())
                or public.is_pool_participant(p.id, auth.uid())
            )
        )
    );

-- comments: allow participants to see comments
drop policy if exists "Comments are viewable by pool participants" on public.comments;

create policy "Comments are viewable by pool participants" on public.comments
    for select using (
        exists (
            select 1 from public.pools p
            where p.id = comments.pool_id
            and (
                (p.type = 'public')
                or (p.created_by = auth.uid())
                or public.is_pool_participant(p.id, auth.uid())
            )
        )
    );
