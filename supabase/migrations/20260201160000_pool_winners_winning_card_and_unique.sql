-- Add winning_card_id and enforce one row per (pool_id, user_id)
alter table public.pool_winners
  add column if not exists winning_card_id uuid references public.parlay_cards(id) on delete set null;

-- Remove duplicates: keep one row per (pool_id, user_id) with highest correct
delete from public.pool_winners
where id not in (
  select id from (
    select id, row_number() over (partition by pool_id, user_id order by correct desc, created_at desc nulls last) as rn
    from public.pool_winners
  ) sub where rn = 1
);

create unique index if not exists idx_pool_winners_pool_user_unique
  on public.pool_winners(pool_id, user_id);
