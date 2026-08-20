-- ============================================================================
-- UNIQUE DISPLAY NAMES + AVATAR STORAGE
--
-- Display names were free text with no uniqueness of any kind. On a product
-- where the name appears next to money — chat authorship, the public winners
-- list, pool participant rows — two accounts sharing a name is an impersonation
-- surface, and "Admin"/"admin"/"Adm1n" next to a payout announcement is the
-- shape that gets used.
--
-- Three things are established here:
--   1. A normalisation key, so uniqueness is CASE- AND SPACING-INSENSITIVE.
--      "John Smith", "john smith" and "JOHN  SMITH" are one name, not three.
--   2. A format constraint the API mirrors exactly, so a rejection reads the
--      same from either layer.
--   3. Reserved names, which no ordinary account may take.
--
-- THE DANGEROUS PART OF THIS MIGRATION is not the constraint, it is the signup
-- trigger. handle_new_user() derives a name from the email local-part, so
-- john@gmail.com and john@yahoo.com both want "john". Adding a unique index
-- without rewriting that trigger makes the SECOND of those signups fail at the
-- auth.users insert — i.e. it breaks registration for everyone unlucky enough
-- to collide, with an opaque database error. The trigger is therefore made
-- collision-safe in the same transaction that adds the constraint.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The normalisation key.
--
-- IMMUTABLE because it is used in an index expression; Postgres will not build
-- one otherwise. Keep it that way: no now(), no session settings, no lookups.
--
-- Also strips characters that exist only to defeat exactly this check —
-- zero-width space/joiner and the bidi controls — before folding case. Without
-- that, "ad​min" normalises to something different from "admin" while
-- rendering identically in every UI the name reaches.
-- ---------------------------------------------------------------------------
create or replace function public.display_name_key(raw text)
returns text
language sql
immutable
strict
set search_path = ''
as $fn$
  select lower(
    btrim(
      regexp_replace(
        -- Characters that exist only to defeat this check: zero-width space,
        -- non-joiner, joiner, LTR/RTL marks, the bidi embedding and override
        -- controls, word joiner, and the BOM. Written as escapes rather than
        -- literals because a literal zero-width character in source is
        -- invisible to every reviewer who comes after.
        regexp_replace(raw, E'[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]', '', 'g'),
        E'\\s+', ' ', 'g'
      )
    )
  );
$fn$;

comment on function public.display_name_key(text) is
  'Normalises a display name for uniqueness: strips zero-width and bidi control characters, collapses internal whitespace, trims, lowercases. IMMUTABLE so it can back a unique index.';

-- The index expression does NOT need the caller to hold EXECUTE — only direct
-- calls do — so this grant exists solely for the availability RPC, which is
-- authenticated-only. anon is deliberately excluded: nothing anonymous calls
-- this, and an unused grant is surface for no benefit.
grant execute on function public.display_name_key(text) to authenticated;
revoke execute on function public.display_name_key(text) from anon, public;

-- ---------------------------------------------------------------------------
-- 2. Reserved names.
--
-- A table rather than a CHECK list so the operator can add to it without a
-- deploy — the same reasoning as jurisdiction_rules. Read-only to clients:
-- the availability endpoint reports "taken" for these without saying why,
-- because "that one is reserved" is a hint worth not giving.
-- ---------------------------------------------------------------------------
create table if not exists public.reserved_display_names (
  name_key text primary key,
  reason   text
);

alter table public.reserved_display_names enable row level security;
-- No policy: clients get nothing. Only the SECURITY DEFINER checks below read it.
revoke all on public.reserved_display_names from anon, authenticated;

insert into public.reserved_display_names (name_key, reason) values
  ('admin',          'staff impersonation'),
  ('administrator',  'staff impersonation'),
  ('moderator',      'staff impersonation'),
  ('mod',            'staff impersonation'),
  ('staff',          'staff impersonation'),
  ('support',        'staff impersonation'),
  ('help',           'staff impersonation'),
  ('helpdesk',       'staff impersonation'),
  ('system',         'system impersonation'),
  ('root',           'system impersonation'),
  ('official',       'authority claim'),
  ('gridiron',       'brand'),
  ('sportspool',     'brand'),
  ('sports pool',    'brand'),
  ('payouts',        'money-path impersonation'),
  ('payout',         'money-path impersonation'),
  ('billing',        'money-path impersonation'),
  ('security',       'money-path impersonation'),
  ('noreply',        'transactional-mail impersonation'),
  ('no-reply',       'transactional-mail impersonation')
on conflict (name_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Format constraint.
--
-- 3-24 characters after normalisation; letters, digits, space, underscore,
-- hyphen and period; must contain at least one letter or digit so a name
-- cannot be punctuation only (or, worse, a single period, which reads as
-- nothing at all in a participant list).
--
-- NOT VALID first, then validated: on a table that already holds rows this
-- takes a weaker lock and surfaces bad data as a validation error rather than
-- an outage. On an empty table it is identical.
-- ---------------------------------------------------------------------------
alter table public.users drop constraint if exists users_name_format;
alter table public.users add constraint users_name_format check (
  length(public.display_name_key(name)) between 3 and 24
  and public.display_name_key(name) ~ '^[a-z0-9 ._-]+$'
  and public.display_name_key(name) ~ '[a-z0-9]'
) not valid;

-- ---------------------------------------------------------------------------
-- 4. Resolve any pre-existing duplicates BEFORE the unique index.
--
-- This platform is pre-launch with zero users, so this is expected to be a
-- no-op. It is written anyway because a migration that assumes an empty table
-- is a migration that fails the one time it matters — a restore, a staging
-- copy, or a client who started taking signups earlier than anyone recorded.
--
-- The oldest account keeps the bare name; later ones get a numeric suffix.
-- Names that fail the FORMAT rule are repaired too, otherwise validating the
-- constraint below would abort.
-- ---------------------------------------------------------------------------
do $$
declare
  r          record;
  candidate  text;
  n          integer;
begin
  -- 4a. Repair names that cannot satisfy the format constraint.
  for r in
    select id, name from public.users
    where length(public.display_name_key(name)) not between 3 and 24
       or public.display_name_key(name) !~ '^[a-z0-9 ._-]+$'
       or public.display_name_key(name) !~ '[a-z0-9]'
  loop
    -- Keep only permitted characters, then pad/trim into range.
    candidate := btrim(regexp_replace(coalesce(r.name, ''), '[^a-zA-Z0-9 ._-]', '', 'g'));
    if length(candidate) < 3 or candidate !~ '[a-zA-Z0-9]' then
      candidate := 'player' || substr(replace(r.id::text, '-', ''), 1, 6);
    end if;
    candidate := substr(candidate, 1, 24);
    update public.users set name = candidate where id = r.id;
    raise notice 'display name repaired for %: % -> %', r.id, r.name, candidate;
  end loop;

  -- 4b. De-duplicate, oldest account wins the bare name.
  for r in
    select id, name, public.display_name_key(name) as key
    from public.users u
    where exists (
      select 1 from public.users other
      where other.id <> u.id
        and public.display_name_key(other.name) = public.display_name_key(u.name)
        and (other.created_at, other.id) < (u.created_at, u.id)
    )
  loop
    n := 2;
    loop
      candidate := substr(r.name, 1, 24 - length(n::text)) || n::text;
      exit when not exists (
        select 1 from public.users
        where public.display_name_key(name) = public.display_name_key(candidate)
      );
      n := n + 1;
    end loop;
    update public.users set name = candidate where id = r.id;
    raise notice 'duplicate display name resolved for %: % -> %', r.id, r.name, candidate;
  end loop;
end $$;

alter table public.users validate constraint users_name_format;

-- ---------------------------------------------------------------------------
-- 5. The unique index.
-- ---------------------------------------------------------------------------
create unique index if not exists users_display_name_key_uidx
  on public.users (public.display_name_key(name));

comment on index public.users_display_name_key_uidx is
  'Case- and spacing-insensitive uniqueness for display names. See display_name_key().';

-- ---------------------------------------------------------------------------
-- 6. Make signup collision-safe.
--
-- Without this, the index above turns a name collision into a failed
-- registration. The desired name is tried first, then suffixed until free.
--
-- The loop is bounded: after 50 attempts it falls back to an id-derived name
-- that cannot realistically collide. An unbounded loop inside a trigger on
-- auth.users is a way to hang signup for everybody.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  desired   text;
  candidate text;
  n         integer := 1;
begin
  desired := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1)
  );

  -- Force the raw value into the shape the format constraint accepts, so a
  -- signup can never be rejected for the shape of an address we derived it
  -- from rather than anything the user chose.
  -- Strip disallowed characters but KEEP the user's capitalisation: the
  -- constraint and the unique index both run on display_name_key(), which
  -- folds case itself, so "John Smith" is a valid stored name whose key is
  -- "john smith". Lowercasing here would silently rename every new account.
  desired := btrim(regexp_replace(desired, '[^a-zA-Z0-9 ._-]', '', 'g'));
  if length(desired) < 3 or desired !~ '[a-zA-Z0-9]' then
    desired := 'player' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  desired := substr(desired, 1, 24);

  -- A RESERVED desired name is replaced outright, never suffixed. Suffixing
  -- was the first implementation and it is wrong: signing up as "admin" then
  -- produced "admin2", which sits beside a payout announcement reading almost
  -- exactly like the thing the reserved list exists to protect. Only genuine
  -- COLLISIONS get a numeric suffix.
  if exists (
    select 1 from public.reserved_display_names
    where name_key = public.display_name_key(desired)
  ) then
    desired := 'player' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  candidate := desired;
  while exists (
    select 1 from public.users
    where public.display_name_key(name) = public.display_name_key(candidate)
  ) or exists (
    select 1 from public.reserved_display_names
    where name_key = public.display_name_key(candidate)
  ) loop
    n := n + 1;
    if n > 50 then
      candidate := 'player' || substr(replace(new.id::text, '-', ''), 1, 12);
      exit;
    end if;
    candidate := substr(desired, 1, 24 - length(n::text)) || n::text;
  end loop;

  insert into public.users (id, email, name, avatar, role)
  values (
    new.id,
    new.email,
    candidate,
    new.raw_user_meta_data->>'avatar_url',
    'user'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Availability, as a SECURITY DEFINER function.
--
-- WHY NOT LET THE CLIENT QUERY IT. public.profiles is world-readable by design
-- (chat authorship, winner lists), so a determined caller can already enumerate
-- names. That is not a reason to hand out a purpose-built oracle: this function
-- returns one boolean and never reveals WHICH account holds a name, whether the
-- clash was with a reserved word, or anything about the caller's own row. The
-- API layer rate-limits it on top.
--
-- Returns TRUE only when the name is well-formed, unreserved, and unheld by
-- anyone other than the caller — so a user re-saving their own unchanged name
-- is told it is available rather than that they have taken it themselves.
-- ---------------------------------------------------------------------------
create or replace function public.is_display_name_available(candidate text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  key text;
begin
  if candidate is null then
    return false;
  end if;

  key := public.display_name_key(candidate);

  if length(key) not between 3 and 24
     or key !~ '^[a-z0-9 ._-]+$'
     or key !~ '[a-z0-9]' then
    return false;
  end if;

  if exists (select 1 from public.reserved_display_names where name_key = key) then
    return false;
  end if;

  return not exists (
    select 1 from public.users
    where public.display_name_key(name) = key
      and id is distinct from auth.uid()
  );
end;
$$;

revoke execute on function public.is_display_name_available(text) from public, anon;
grant  execute on function public.is_display_name_available(text) to authenticated;

comment on function public.is_display_name_available(text) is
  'True when the display name is well-formed, not reserved, and not held by another account. Excludes the caller so re-saving an unchanged name is allowed.';

-- ---------------------------------------------------------------------------
-- 8. Reserved names must also be unusable through a direct UPDATE.
--
-- authenticated holds UPDATE(name, avatar) on public.users (20260811000000), so
-- the API is not the only path to this column. The availability function is
-- advisory; this trigger is the enforcement.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_display_name_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.name is not distinct from old.name then
    return new;
  end if;

  if exists (
    select 1 from public.reserved_display_names
    where name_key = public.display_name_key(new.name)
  ) then
    raise exception 'display name is not available'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_display_name_rules on public.users;
create trigger trg_enforce_display_name_rules
  before insert or update of name on public.users
  for each row execute function public.enforce_display_name_rules();

-- ---------------------------------------------------------------------------
-- 9. Avatar storage.
--
-- GUARDED: the self-hosted compose stack (--profile bundled-db) runs Postgres,
-- GoTrue, PostgREST, Realtime and Kong but NOT storage-api, so the `storage`
-- schema does not exist there and every statement below would abort the whole
-- migration. Skipping leaves the rest of this file — the part that matters —
-- applying cleanly, and avatar upload degrades to "not configured" rather than
-- taking the deployment down.
--
-- Bucket is PUBLIC-READ: avatars appear next to public chat messages and on the
-- winners list, so signed URLs would buy nothing and cost a round trip per
-- render. Writes are NOT granted to clients — uploads go through
-- /api/me/avatar with the service role, which is what lets the server verify
-- the file is genuinely an image before it is ever stored.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent (no storage-api in this deployment) — skipping avatar bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'avatars', 'avatars', true, 2097152,
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do update
    set public             = true,
        file_size_limit    = 2097152,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  -- Anyone may read an avatar; nobody but the service role may write one.
  execute $p$drop policy if exists "Avatars are publicly readable" on storage.objects$p$;
  execute $p$create policy "Avatars are publicly readable" on storage.objects
             for select using (bucket_id = 'avatars')$p$;

  -- No insert/update/delete policy is created on purpose. Uploads run with the
  -- service role, which bypasses RLS, and that is precisely what forces every
  -- avatar through /api/me/avatar where the bytes can be checked first.
end $$;

-- ---------------------------------------------------------------------------
-- 10. Invariants — assert the end state rather than trust the statements above.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'users_display_name_key_uidx'
  ) then
    raise exception 'display name uniqueness index missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'users_name_format' and convalidated
  ) then
    raise exception 'users_name_format constraint missing or not validated';
  end if;

  if has_function_privilege('anon', 'public.is_display_name_available(text)', 'EXECUTE') then
    raise exception 'anon can probe display-name availability';
  end if;

  if has_function_privilege('anon', 'public.display_name_key(text)', 'EXECUTE') then
    raise exception 'anon retains EXECUTE on display_name_key';
  end if;

  -- The profile-edit path this whole feature depends on must still exist.
  if not has_column_privilege('authenticated', 'public.users', 'name', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.users', 'avatar', 'UPDATE') then
    raise exception 'authenticated lost UPDATE(name, avatar)';
  end if;

  -- And the columns that must never become client-writable still are not.
  if has_column_privilege('authenticated', 'public.users', 'balance', 'UPDATE')
     or has_column_privilege('authenticated', 'public.users', 'role', 'UPDATE') then
    raise exception 'users.balance or users.role became client-writable';
  end if;
end $$;
