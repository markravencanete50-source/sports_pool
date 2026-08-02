-- Allow pool creators to delete pool_games (needed for pool edit)
create policy "Pool creators can delete pool games" on public.pool_games
    for delete using (
        exists (
            select 1 from public.pools
            where pools.id = pool_games.pool_id
            and pools.created_by = auth.uid()
        )
    );
