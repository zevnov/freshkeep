-- Run in Supabase SQL editor for individual profiles: a unique username, and a private
-- body-fat log. Body-fat entries are health data, so only their owner can read them;
-- household members see each other's display name and username, nothing else.

alter table public.profiles add column if not exists username text;

alter table public.profiles drop constraint if exists profiles_username_format_check;
alter table public.profiles
  add constraint profiles_username_format_check
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

create unique index if not exists profiles_username_unique_idx on public.profiles (username);

create table if not exists public.body_fat_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recorded_on date not null default current_date,
  percent numeric(4, 1) not null check (percent between 2 and 70),
  created_at timestamptz not null default now(),
  -- One reading per day; logging again the same day replaces it.
  unique (user_id, recorded_on)
);

alter table public.body_fat_entries enable row level security;

drop policy if exists body_fat_select on public.body_fat_entries;
create policy body_fat_select on public.body_fat_entries
  for select to authenticated using (user_id = auth.uid());

drop policy if exists body_fat_insert on public.body_fat_entries;
create policy body_fat_insert on public.body_fat_entries
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists body_fat_update on public.body_fat_entries;
create policy body_fat_update on public.body_fat_entries
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists body_fat_delete on public.body_fat_entries;
create policy body_fat_delete on public.body_fat_entries
  for delete to authenticated using (user_id = auth.uid());
