-- Initial schema migration
-- Generated from existing Supabase database
-- Migration: 20260201000000_initial_schema

-- Enable required extensions
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- Create users table (base table, no dependencies)
-- Note: id references auth.users(id) but we don't add FK constraint 
-- because auth schema is managed by Supabase
create table if not exists public.users (
    id uuid primary key,
    email text not null,
    name text not null,
    avatar text,
    role text default 'user',  -- 'user' | 'admin'
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

comment on column public.users.role is 'User role: user | admin';

-- Create teams table
create table if not exists public.teams (
    id text primary key,
    name text not null,
    city text not null,
    abbreviation text not null unique,
    logo text not null,
    primary_color text not null,
    secondary_color text not null,
    created_at timestamp with time zone default now()
);

-- Create games table
create table if not exists public.games (
    id text primary key,
    home_team_id text not null references public.teams(id),
    away_team_id text not null references public.teams(id),
    date timestamp with time zone not null,
    status text not null default 'scheduled',
    home_score integer,
    away_score integer,
    odds text,
    week integer,
    season integer not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Create notifications table
create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id),
    type text not null,
    title text not null,
    message text not null,
    data jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Create platform_settings table
create table if not exists public.platform_settings (
    id uuid primary key default extensions.uuid_generate_v4(),
    platform_fee_percentage numeric not null default 10.00,
    minimum_entry_fee numeric not null default 20.00,
    updated_at timestamp with time zone default now(),
    updated_by uuid references public.users(id)
);

-- Create pools table
create table if not exists public.pools (
    id uuid primary key default extensions.uuid_generate_v4(),
    name text not null,
    type text not null,
    entry_fee numeric not null default 20.00,
    max_participants integer,
    participants integer not null default 1,
    prize_pot numeric not null default 0,
    week integer not null,
    status text not null default 'open',
    created_by uuid not null references public.users(id),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    season integer not null default 2024
);

-- Create pool_games table
create table if not exists public.pool_games (
    id uuid primary key default extensions.uuid_generate_v4(),
    pool_id uuid not null references public.pools(id),
    game_id text not null references public.games(id),
    created_at timestamp with time zone default now(),
    unique(pool_id, game_id)
);

-- Create pool_participants table
create table if not exists public.pool_participants (
    id uuid primary key default extensions.uuid_generate_v4(),
    pool_id uuid not null references public.pools(id),
    user_id uuid not null references public.users(id),
    joined_at timestamp with time zone default now(),
    unique(pool_id, user_id)
);

-- Create pool_invitations table
create table if not exists public.pool_invitations (
    id uuid primary key default extensions.uuid_generate_v4(),
    pool_id uuid not null references public.pools(id),
    invited_user_id uuid not null references public.users(id),
    invited_by uuid not null references public.users(id),
    status text not null default 'pending',
    created_at timestamp with time zone default now(),
    unique(pool_id, invited_user_id)
);

-- Create picks table
create table if not exists public.picks (
    id uuid primary key default extensions.uuid_generate_v4(),
    pool_id uuid not null references public.pools(id),
    user_id uuid not null references public.users(id),
    game_id text not null references public.games(id),
    team_id text references public.teams(id),
    prediction text,
    total_score_prediction integer,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(pool_id, user_id, game_id)
);

-- Create parlay_cards table
create table if not exists public.parlay_cards (
    id uuid primary key default extensions.uuid_generate_v4(),
    pool_id uuid not null references public.pools(id),
    user_id uuid not null references public.users(id),
    card_number integer not null,
    entry_fee_paid numeric not null,
    status text not null default 'pending',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(pool_id, user_id, card_number)
);

-- Create card_picks table
create table if not exists public.card_picks (
    id uuid primary key default extensions.uuid_generate_v4(),
    card_id uuid not null references public.parlay_cards(id),
    game_id text not null references public.games(id),
    prediction text,
    total_score_prediction integer,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(card_id, game_id)
);

-- Create pool_transactions table
create table if not exists public.pool_transactions (
    id uuid primary key default extensions.uuid_generate_v4(),
    pool_id uuid not null references public.pools(id),
    user_id uuid not null references public.users(id),
    card_id uuid not null references public.parlay_cards(id),
    amount numeric not null,
    platform_fee numeric not null,
    net_amount numeric not null,
    status text not null default 'pending',
    payment_provider text,
    payment_id text unique,
    stripe_session_id text unique,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Create comments table
create table if not exists public.comments (
    id uuid primary key default extensions.uuid_generate_v4(),
    pool_id uuid not null references public.pools(id),
    user_id uuid not null references public.users(id),
    text text not null,
    created_at timestamp with time zone default now()
);

-- Create indexes for performance
create index if not exists idx_games_date on public.games(date);
create index if not exists idx_games_week on public.games(week);
create index if not exists idx_games_status on public.games(status);

create index if not exists idx_pools_type on public.pools(type);
create index if not exists idx_pools_status on public.pools(status);
create index if not exists idx_pools_week on public.pools(week);
create index if not exists idx_pools_week_season on public.pools(week, season);

create index if not exists idx_pool_participants_pool on public.pool_participants(pool_id);
create index if not exists idx_pool_participants_user on public.pool_participants(user_id);

create index if not exists idx_picks_pool on public.picks(pool_id);
create index if not exists idx_picks_user on public.picks(user_id);
create index if not exists idx_picks_prediction on public.picks(pool_id, game_id, prediction);

create index if not exists idx_parlay_cards_pool on public.parlay_cards(pool_id);
create index if not exists idx_parlay_cards_pool_user on public.parlay_cards(pool_id, user_id);
create index if not exists idx_parlay_cards_status on public.parlay_cards(status);
create unique index if not exists idx_parlay_cards_user_pool_number on public.parlay_cards(user_id, pool_id, card_number) 
    where status = any(array['pending'::text, 'active'::text, 'completed'::text]);

create index if not exists idx_card_picks_card on public.card_picks(card_id);
create index if not exists idx_card_picks_game on public.card_picks(game_id);

create index if not exists idx_pool_transactions_pool on public.pool_transactions(pool_id);
create index if not exists idx_pool_transactions_user on public.pool_transactions(user_id);
create index if not exists idx_pool_transactions_card on public.pool_transactions(card_id);
create index if not exists idx_pool_transactions_payment_id on public.pool_transactions(payment_id);
create index if not exists idx_pool_transactions_card_id on public.pool_transactions(card_id);

create index if not exists idx_comments_pool on public.comments(pool_id);

create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_user_unread on public.notifications(user_id, read_at) where read_at is null;
create index if not exists idx_notifications_created_at on public.notifications(created_at desc);
create index if not exists idx_notifications_type on public.notifications(type);

-- Enable Row Level Security
alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.games enable row level security;
alter table public.notifications enable row level security;
alter table public.platform_settings enable row level security;
alter table public.pools enable row level security;
alter table public.pool_games enable row level security;
alter table public.pool_participants enable row level security;
alter table public.pool_invitations enable row level security;
alter table public.picks enable row level security;
alter table public.parlay_cards enable row level security;
alter table public.card_picks enable row level security;
alter table public.pool_transactions enable row level security;
alter table public.comments enable row level security;

-- RLS Policies for users table
create policy "Users can view all profiles" on public.users
    for select using (true);

create policy "Users can insert own profile" on public.users
    for insert with check (auth.uid() = id);

create policy "Users can update own profile" on public.users
    for update using (auth.uid() = id);

-- RLS Policies for teams table
create policy "Teams are viewable by everyone" on public.teams
    for select using (true);

create policy "Authenticated users can insert teams" on public.teams
    for insert with check (auth.uid() is not null);

create policy "Authenticated users can update teams" on public.teams
    for update using (auth.uid() is not null);

-- RLS Policies for games table
create policy "Games are viewable by everyone" on public.games
    for select using (true);

create policy "Authenticated users can insert games" on public.games
    for insert with check (auth.uid() is not null);

create policy "Authenticated users can update games" on public.games
    for update using (auth.uid() is not null);

-- RLS Policies for notifications table
create policy "Users can view own notifications" on public.notifications
    for select using (auth.uid() = user_id);

create policy "Users can update own notifications" on public.notifications
    for update using (auth.uid() = user_id);

create policy "Users can delete own notifications" on public.notifications
    for delete using (auth.uid() = user_id);

-- RLS Policies for platform_settings table
create policy "Anyone can view platform settings" on public.platform_settings
    for select using (true);

-- RLS Policies for pools table
create policy "Public pools are viewable by everyone" on public.pools
    for select using ((type = 'public') or (created_by = auth.uid()));

create policy "Users can create pools" on public.pools
    for insert with check (auth.uid() = created_by);

create policy "Users can update own pools" on public.pools
    for update using (auth.uid() = created_by);

-- RLS Policies for pool_games table
create policy "Pool games are viewable by pool members" on public.pool_games
    for select using (
        exists (
            select 1 from public.pools
            where pools.id = pool_games.pool_id
            and ((pools.type = 'public') or (pools.created_by = auth.uid()))
        )
    );

create policy "Pool creators can insert pool games" on public.pool_games
    for insert with check (
        exists (
            select 1 from public.pools
            where pools.id = pool_games.pool_id
            and pools.created_by = auth.uid()
        )
    );

-- RLS Policies for pool_participants table
create policy "Pool participants are viewable by pool participants" on public.pool_participants
    for select using (
        exists (
            select 1 from public.pools
            where pools.id = pool_participants.pool_id
            and ((pools.type = 'public') or (pools.created_by = auth.uid()))
        )
    );

create policy "Users can join pools" on public.pool_participants
    for insert with check (auth.uid() = user_id);

-- RLS Policies for pool_invitations table
create policy "Users can view own invitations" on public.pool_invitations
    for select using ((auth.uid() = invited_user_id) or (auth.uid() = invited_by));

create policy "Users can create invitations" on public.pool_invitations
    for insert with check (auth.uid() = invited_by);

create policy "Users can update own invitations" on public.pool_invitations
    for update using (auth.uid() = invited_user_id);

-- RLS Policies for picks table
create policy "Picks are viewable by pool participants" on public.picks
    for select using (
        exists (
            select 1 from public.pools
            where pools.id = picks.pool_id
            and ((pools.type = 'public') or (pools.created_by = auth.uid()))
        )
    );

create policy "Users can create own picks" on public.picks
    for insert with check (auth.uid() = user_id);

create policy "Users can update own picks" on public.picks
    for update using (auth.uid() = user_id);

-- RLS Policies for parlay_cards table
create policy "Users can read own parlay_cards" on public.parlay_cards
    for select using (user_id = auth.uid());

create policy "Users can insert own parlay_cards" on public.parlay_cards
    for insert with check (user_id = auth.uid());

create policy "Users can update own parlay_cards" on public.parlay_cards
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users can delete own parlay_cards" on public.parlay_cards
    for delete using (user_id = auth.uid());

-- RLS Policies for card_picks table
create policy "Users can view picks for own cards" on public.card_picks
    for select using (
        exists (
            select 1 from public.parlay_cards
            where parlay_cards.id = card_picks.card_id
            and parlay_cards.user_id = auth.uid()
        )
    );

create policy "Users can view picks in pools they participate in" on public.card_picks
    for select using (
        exists (
            select 1 from public.parlay_cards pc
            join public.parlay_cards pc2 on pc.pool_id = pc2.pool_id
            where pc.id = card_picks.card_id
            and pc2.user_id = auth.uid()
        )
    );

create policy "Users can insert picks for own cards" on public.card_picks
    for insert with check (
        exists (
            select 1 from public.parlay_cards
            where parlay_cards.id = card_picks.card_id
            and parlay_cards.user_id = auth.uid()
        )
    );

create policy "Users can update picks for own cards" on public.card_picks
    for update using (
        exists (
            select 1 from public.parlay_cards
            where parlay_cards.id = card_picks.card_id
            and parlay_cards.user_id = auth.uid()
        )
    ) with check (
        exists (
            select 1 from public.parlay_cards
            where parlay_cards.id = card_picks.card_id
            and parlay_cards.user_id = auth.uid()
        )
    );

create policy "Users can delete picks for own cards" on public.card_picks
    for delete using (
        exists (
            select 1 from public.parlay_cards
            where parlay_cards.id = card_picks.card_id
            and parlay_cards.user_id = auth.uid()
        )
    );

-- RLS Policies for pool_transactions table
create policy "Users can view own transactions" on public.pool_transactions
    for select using (auth.uid() = user_id);

create policy "Users can create own transactions" on public.pool_transactions
    for insert with check (auth.uid() = user_id);

-- RLS Policies for comments table
create policy "Comments are viewable by pool participants" on public.comments
    for select using (
        exists (
            select 1 from public.pools
            where pools.id = comments.pool_id
            and ((pools.type = 'public') or (pools.created_by = auth.uid()))
        )
    );

create policy "Authenticated users can create comments" on public.comments
    for insert with check (auth.uid() = user_id);

-- =====================================================
-- TRIGGER: Auto-create user profile on signup
-- =====================================================
-- This trigger automatically creates a public.users profile
-- when a new user signs up via Supabase Auth

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
    insert into public.users (id, email, name, avatar, role)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url',
        'user'
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

-- Create trigger on auth.users (only if it doesn't exist)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- =====================================================
-- TRIGGER: Update updated_at timestamp
-- =====================================================
-- Auto-update the updated_at column on row changes

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Apply updated_at trigger to relevant tables
create trigger update_users_updated_at
    before update on public.users
    for each row execute function public.update_updated_at_column();

create trigger update_games_updated_at
    before update on public.games
    for each row execute function public.update_updated_at_column();

create trigger update_pools_updated_at
    before update on public.pools
    for each row execute function public.update_updated_at_column();

create trigger update_picks_updated_at
    before update on public.picks
    for each row execute function public.update_updated_at_column();

create trigger update_parlay_cards_updated_at
    before update on public.parlay_cards
    for each row execute function public.update_updated_at_column();

create trigger update_card_picks_updated_at
    before update on public.card_picks
    for each row execute function public.update_updated_at_column();

create trigger update_pool_transactions_updated_at
    before update on public.pool_transactions
    for each row execute function public.update_updated_at_column();

create trigger update_notifications_updated_at
    before update on public.notifications
    for each row execute function public.update_updated_at_column();

create trigger update_platform_settings_updated_at
    before update on public.platform_settings
    for each row execute function public.update_updated_at_column();
