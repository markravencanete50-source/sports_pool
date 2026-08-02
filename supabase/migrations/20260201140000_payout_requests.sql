-- Payout requests table (structure for Stripe Connect payouts)
create table if not exists public.payout_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id),
    pool_id uuid not null references public.pools(id),
    amount numeric not null,
    status text not null default 'pending',
    stripe_transfer_id text,
    created_at timestamp with time zone default now(),
    processed_at timestamp with time zone,
    processed_by uuid references public.users(id),
    unique(user_id, pool_id)
);

create index if not exists idx_payout_requests_user on public.payout_requests(user_id);
create index if not exists idx_payout_requests_pool on public.payout_requests(pool_id);
create index if not exists idx_payout_requests_status on public.payout_requests(status);

alter table public.payout_requests enable row level security;

create policy "Users can view own payout requests" on public.payout_requests
    for select using (auth.uid() = user_id);

create policy "Users can insert own payout requests" on public.payout_requests
    for insert with check (auth.uid() = user_id);

-- Admin can view all payout requests (via service role or add RLS for admin)
create policy "Admin can view all payout requests" on public.payout_requests
    for select using (
        exists (
            select 1 from public.users
            where users.id = auth.uid() and users.role = 'admin'
        )
    );
