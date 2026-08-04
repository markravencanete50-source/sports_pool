-- Supabase security advisor: clear the ERROR-level security_definer_view lint.
--
-- public.public_profiles was a view created with security_invoker = off, so it
-- read public.users with the VIEW OWNER's rights and bypassed RLS entirely.
-- That is safe only while nobody widens its column list. A real table with its
-- own permissive-read policy gives the same public-name lookup with no bypass.
drop view if exists public.public_profiles;

create table if not exists public.profiles (
  id         uuid primary key references public.users(id) on delete cascade,
  name       text,
  avatar     text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Display names are public by design (chat authors, winner lists). Only these
-- three columns live here, so a world-readable policy cannot leak email, role
-- or balance the way the old users(*) embeds did.
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles
  for select using (true);

revoke insert, update, delete on public.profiles from anon, authenticated;

create or replace function public.sync_profile_from_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, avatar, updated_at)
  values (new.id, new.name, new.avatar, now())
  on conflict (id) do update
    set name = excluded.name, avatar = excluded.avatar, updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_profile on public.users;
create trigger trg_sync_profile
  after insert or update of name, avatar on public.users
  for each row execute function public.sync_profile_from_user();

insert into public.profiles (id, name, avatar)
select id, name, avatar from public.users
on conflict (id) do nothing;
