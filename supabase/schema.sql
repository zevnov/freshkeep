-- Run in Supabase SQL editor after creating a project.
-- Auth: enable Email provider (and optional Apple/Google) in Dashboard → Authentication.

create extension if not exists "pgcrypto";

-- Households
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  household_id uuid not null references public.households (id) on delete restrict,
  default_bucket text not null default 'ours' check (default_bucket in ('ours', 'mine')),
  default_storage text not null default 'fridge' check (default_storage in ('fridge', 'freezer', 'pantry', 'counter')),
  notification_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_valid_notification_settings(raw jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    jsonb_typeof(raw) = 'object'
    and (
      not (raw ? 'masterEnabled')
      or jsonb_typeof(raw->'masterEnabled') = 'boolean'
    )
    and (
      not (raw ? 'notificationStyle')
      or (raw->>'notificationStyle') in ('individual', 'digest')
    )
    and (
      not (raw ? 'notifySoon')
      or jsonb_typeof(raw->'notifySoon') = 'boolean'
    )
    and (
      not (raw ? 'notifyToday')
      or jsonb_typeof(raw->'notifyToday') = 'boolean'
    )
    and (
      not (raw ? 'notifyOverdue')
      or jsonb_typeof(raw->'notifyOverdue') = 'boolean'
    )
    and (
      not (raw ? 'includeMine')
      or jsonb_typeof(raw->'includeMine') = 'boolean'
    )
    and (
      not (raw ? 'defaultSoonDays')
      or (
        jsonb_typeof(raw->'defaultSoonDays') = 'number'
        and (raw->>'defaultSoonDays')::int between 1 and 30
      )
    )
    and (
      not (raw ? 'soonHour')
      or (
        jsonb_typeof(raw->'soonHour') = 'number'
        and (raw->>'soonHour')::int between 0 and 23
      )
    )
    and (
      not (raw ? 'todayHour')
      or (
        jsonb_typeof(raw->'todayHour') = 'number'
        and (raw->>'todayHour')::int between 0 and 23
      )
    )
    and (
      not (raw ? 'overdueHour')
      or (
        jsonb_typeof(raw->'overdueHour') = 'number'
        and (raw->>'overdueHour')::int between 0 and 23
      )
    )
    and (
      not (raw ? 'digestHour')
      or (
        jsonb_typeof(raw->'digestHour') = 'number'
        and (raw->>'digestHour')::int between 0 and 23
      )
    )
    and (
      not (raw ? 'digestMinute')
      or (
        jsonb_typeof(raw->'digestMinute') = 'number'
        and (raw->>'digestMinute')::int between 0 and 59
      )
    );
$$;

alter table public.profiles drop constraint if exists profiles_notification_settings_valid_check;
alter table public.profiles
  add constraint profiles_notification_settings_valid_check
  check (public.is_valid_notification_settings(notification_settings));

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (household_id, user_id)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('ours', 'mine')),
  name text not null,
  storage text not null check (storage in ('fridge', 'freezer', 'pantry', 'counter')),
  spoil_on date not null,
  quantity numeric,
  unit text,
  notes text,
  remind_me boolean not null default false,
  remind_days_before int not null default 0,
  status text not null default 'active' check (status in ('active', 'consumed', 'trashed')),
  schedule_version int not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_household_spoil on public.items (household_id, spoil_on);
create index if not exists items_owner on public.items (owner_user_id);

create table if not exists public.barcode_lookup_cache (
  barcode text primary key,
  response jsonb not null,
  source text not null default 'open_food_facts',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists barcode_lookup_cache_expires_at_idx
  on public.barcode_lookup_cache (expires_at);

alter table public.barcode_lookup_cache enable row level security;

create table if not exists public.item_write_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists item_write_audit_user_created_at_idx
  on public.item_write_audit (user_id, created_at desc);

alter table public.item_write_audit enable row level security;

create table if not exists public.invite_write_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists invite_write_audit_user_created_at_idx
  on public.invite_write_audit (user_id, created_at desc);

alter table public.invite_write_audit enable row level security;

-- New user → household + profile + membership
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  dname text;
begin
  dname := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1),
    'You'
  );
  insert into public.households (name)
  values (dname || '''s kitchen')
  returning id into hid;

  insert into public.profiles (id, display_name, household_id)
  values (new.id, dname, hid);

  insert into public.household_members (household_id, user_id, role)
  values (hid, new.id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.household_members enable row level security;
alter table public.items enable row level security;

-- Membership lookup without re-entering household_members RLS (avoids infinite recursion → HTTP 500).
create or replace function public.user_household_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select household_id
  from public.household_members
  where user_id = auth.uid();
$$;

revoke all on function public.user_household_ids() from public;
grant execute on function public.user_household_ids() to authenticated;

create or replace function public.is_valid_item_name(raw_name text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select raw_name is not null
    and char_length(raw_name) <= 120
    and char_length(
      regexp_replace(
        regexp_replace(btrim(raw_name), '[[:space:]]', '', 'g'),
        '[' || chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279) || ']',
        '',
        'g'
      )
    ) > 0;
$$;

alter table public.items drop constraint if exists items_name_valid_check;
alter table public.items
  add constraint items_name_valid_check
  check (public.is_valid_item_name(name));

create or replace function public.enforce_item_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  recent_count int;
begin
  if uid is null then
    return new;
  end if;

  delete from public.item_write_audit
  where user_id = uid
    and created_at < now() - interval '1 day';

  select count(*)::int into recent_count
  from public.item_write_audit
  where user_id = uid
    and created_at >= now() - interval '1 minute';

  if recent_count >= 60 then
    raise exception 'Too many item changes. Please wait a minute and try again.';
  end if;

  insert into public.item_write_audit (user_id) values (uid);

  return new;
end;
$$;

drop trigger if exists items_rate_limit_write on public.items;
create trigger items_rate_limit_write
  before insert or update on public.items
  for each row execute function public.enforce_item_write_rate_limit();

create or replace function public.enforce_invite_write_rate_limit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  recent_count int;
begin
  if uid is null then
    return;
  end if;

  delete from public.invite_write_audit
  where user_id = uid
    and created_at < now() - interval '7 days';

  select count(*)::int into recent_count
  from public.invite_write_audit
  where user_id = uid
    and created_at >= now() - interval '1 hour';

  if recent_count >= 10 then
    raise exception 'Too many invite codes created. Please wait a bit and try again.';
  end if;

  insert into public.invite_write_audit (user_id) values (uid);
end;
$$;

create policy households_select on public.households
  for select to authenticated
  using (id in (select public.user_household_ids()));

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy members_select on public.household_members
  for select to authenticated
  using (household_id in (select public.user_household_ids()));

-- Items: visible if same household and (ours or own mine)
create policy items_select on public.items
  for select to authenticated
  using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = items.household_id and hm.user_id = auth.uid()
    )
    and (
      scope = 'ours'
      or (scope = 'mine' and owner_user_id = auth.uid())
    )
  );

create policy items_insert on public.items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = items.household_id and hm.user_id = auth.uid()
    )
    and (
      scope = 'ours'
      or (scope = 'mine' and owner_user_id = auth.uid())
    )
    and created_by = auth.uid()
  );

create policy items_update on public.items
  for update to authenticated
  using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = items.household_id and hm.user_id = auth.uid()
    )
    and (
      scope = 'ours'
      or (scope = 'mine' and owner_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = items.household_id and hm.user_id = auth.uid()
    )
    and (
      scope = 'ours'
      or (scope = 'mine' and owner_user_id = auth.uid())
    )
    -- owner_user_id may only be set to the current user or null; never to another user's id
    and (owner_user_id is null or owner_user_id = auth.uid())
    -- created_by is immutable; clients may not change it
    and created_by = (select i.created_by from public.items i where i.id = items.id)
  );

create policy items_delete on public.items
  for delete to authenticated
  using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = items.household_id and hm.user_id = auth.uid()
    )
    and (
      scope = 'ours'
      or (scope = 'mine' and owner_user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Household invites (join codes) + peer profile names for member list
-- If you already applied an older schema.sql, run supabase/invites_addon.sql instead.
-- ---------------------------------------------------------------------------

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists household_invites_one_active_per_household_idx
  on public.household_invites (household_id)
  where revoked_at is null;

alter table public.household_invites enable row level security;

create policy household_invites_select on public.household_invites
  for select to authenticated
  using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = household_invites.household_id and hm.user_id = auth.uid()
    )
  );

create policy household_invites_insert on public.household_invites
  for insert to authenticated
  with check (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = household_invites.household_id and hm.user_id = auth.uid()
    )
    and created_by = auth.uid()
  );

create policy household_invites_delete on public.household_invites
  for delete to authenticated
  using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = household_invites.household_id and hm.user_id = auth.uid()
    )
  );

-- Allow reading display names of people in the same household (member list).
create policy profiles_select_peers on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.household_members h1
      join public.household_members h2 on h2.household_id = h1.household_id
      where h1.user_id = auth.uid() and h2.user_id = profiles.id
    )
  );

create or replace function public.create_household_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  new_code text;
  exp timestamptz;
begin
  select p.household_id into hid from public.profiles p where p.id = auth.uid();
  if hid is null then
    raise exception 'no_household';
  end if;
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = hid and hm.user_id = auth.uid()
  ) then
    raise exception 'not_a_member';
  end if;

  perform public.enforce_invite_write_rate_limit();

  perform 1
  from public.households
  where id = hid
  for update;

  update public.household_invites
  set revoked_at = now()
  where household_id = hid
    and revoked_at is null;

  new_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  exp := now() + interval '7 days';
  insert into public.household_invites (household_id, code, expires_at, revoked_at, created_by)
  values (hid, new_code, exp, null, auth.uid());

  return query select new_code, exp;
end;
$$;

grant execute on function public.create_household_invite() to authenticated;

create or replace function public.join_household(invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.household_invites%rowtype;
  uid uuid := auth.uid();
  norm text;
  old_hid uuid;
  member_count int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  norm := upper(replace(replace(trim(both from invite_code), '-', ''), ' ', ''));
  if norm is null or norm !~ '^[A-F0-9]{8}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  select * into inv
  from public.household_invites
  where code = norm
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  if exists (
    select 1 from public.household_members m
    where m.household_id = inv.household_id and m.user_id = uid
  ) then
    return jsonb_build_object('ok', true, 'already_member', true, 'household_id', inv.household_id);
  end if;

  select household_id into old_hid from public.profiles where id = uid;

  if old_hid is not null and old_hid <> inv.household_id then
    select count(*)::int into member_count from public.household_members where household_id = old_hid;
    if member_count = 1 then
      if exists (
        select 1 from public.items i
        where i.household_id = old_hid and i.status = 'active'
      ) then
        return jsonb_build_object(
          'ok', false,
          'error', 'solo_household_has_active_items'
        );
      end if;
    end if;
  end if;

  delete from public.household_members where user_id = uid;

  update public.profiles
  set household_id = inv.household_id, updated_at = now()
  where id = uid;

  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, uid, 'member');

  return jsonb_build_object('ok', true, 'household_id', inv.household_id);
end;
$$;

grant execute on function public.join_household(text) to authenticated;
