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
  owner_user_id uuid references auth.users (id) on delete cascade,
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
  );

-- created_by is immutable. Enforced by a trigger rather than in items_update's with check:
-- a policy on items that selects from items raises "infinite recursion detected in policy".
create or replace function public.items_created_by_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable';
  end if;
  return new;
end $$;

drop trigger if exists items_created_by_immutable on public.items;
create trigger items_created_by_immutable
  before update on public.items
  for each row execute function public.items_created_by_immutable();

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

-- ---------------------------------------------------------------------------
-- August 2026 features. Same SQL as the patches of the same names; existing
-- projects run those patches in this order instead of re-running this file.
-- ---------------------------------------------------------------------------

-- >>> supabase/patches/items_product_columns.sql

-- Run in Supabase SQL editor to store product details on items: what a barcode scan or
-- quick-add search found (nutrition, image, manufacturer storage tip), plus the food
-- category and the icon the user picked. Every column is nullable, so existing rows and
-- older app builds keep working.

alter table public.items add column if not exists category text;
alter table public.items add column if not exists icon text;
alter table public.items add column if not exists barcode text;
alter table public.items add column if not exists brand text;
alter table public.items add column if not exists image_url text;
alter table public.items add column if not exists nutrition jsonb;
alter table public.items add column if not exists storage_tip text;

alter table public.items drop constraint if exists items_product_columns_check;
alter table public.items
  add constraint items_product_columns_check
  check (
    (category is null or char_length(category) <= 40)
    and (icon is null or char_length(icon) <= 16)
    and (barcode is null or barcode ~ '^\d{8,14}$')
    and (brand is null or char_length(brand) <= 120)
    and (image_url is null or (char_length(image_url) <= 500 and image_url like 'https://%'))
    and (nutrition is null or jsonb_typeof(nutrition) = 'object')
    and (storage_tip is null or char_length(storage_tip) <= 500)
  );

-- Recall matching looks items up by barcode.
create index if not exists items_barcode_active_idx
  on public.items (barcode)
  where barcode is not null and status = 'active';

-- >>> supabase/patches/product_search_cache.sql

-- Run in Supabase SQL editor to support the product-search edge function (quick add).
-- Open Food Facts rate-limits search per IP and every user shares the function's IP,
-- so results are cached per normalized query. Only the service role touches this table.

create table if not exists public.product_search_cache (
  query text primary key,
  response jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists product_search_cache_expires_at_idx
  on public.product_search_cache (expires_at);

alter table public.product_search_cache enable row level security;

-- >>> supabase/patches/profiles_username_body_fat.sql

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

-- >>> supabase/patches/household_management.sql

-- Run in Supabase SQL editor for household management: an "admin" role between owner
-- and member, renaming the household, changing roles, removing members and leaving.
--
-- Permissions:
--   owner  – everything: rename, set roles (including handing ownership over), remove anyone
--   admin  – rename, remove members (not the owner or other admins)
--   member – add and edit items, create invite codes (unchanged)
--
-- Everything goes through security-definer RPCs; household_members and households keep
-- no client write policies.

alter table public.household_members drop constraint if exists household_members_role_check;
alter table public.household_members
  add constraint household_members_role_check check (role in ('owner', 'admin', 'member'));

-- The caller's role in household `hid`, or '' when they aren't a member.
create or replace function public.my_household_role(hid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  -- '' rather than null for non-members, so "role not in (...)" checks can't pass on a null.
  select coalesce(
    (select role from public.household_members where household_id = hid and user_id = auth.uid()),
    ''
  );
$$;

revoke all on function public.my_household_role(uuid) from public;
grant execute on function public.my_household_role(uuid) to authenticated;

create or replace function public.rename_household(new_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  clean text := regexp_replace(btrim(coalesce(new_name, '')), '\s+', ' ', 'g');
begin
  select household_id into hid from public.profiles where id = auth.uid();
  if hid is null then return jsonb_build_object('ok', false, 'error', 'no_household'); end if;
  if public.my_household_role(hid) not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(clean) < 1 or char_length(clean) > 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  update public.households set name = clean where id = hid;
  return jsonb_build_object('ok', true, 'name', clean);
end;
$$;

grant execute on function public.rename_household(text) to authenticated;

-- Owner only. Setting someone to 'owner' hands ownership over; the old owner becomes an admin.
create or replace function public.set_household_member_role(target uuid, new_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  target_role text;
begin
  select household_id into hid from public.profiles where id = uid;
  if hid is null then return jsonb_build_object('ok', false, 'error', 'no_household'); end if;
  if public.my_household_role(hid) <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if new_role not in ('owner', 'admin', 'member') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  if target = uid then
    return jsonb_build_object('ok', false, 'error', 'cannot_change_own_role');
  end if;

  select role into target_role from public.household_members where household_id = hid and user_id = target;
  if target_role is null then return jsonb_build_object('ok', false, 'error', 'not_a_member'); end if;

  if new_role = 'owner' then
    update public.household_members set role = 'admin' where household_id = hid and user_id = uid;
  end if;
  update public.household_members set role = new_role where household_id = hid and user_id = target;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_household_member_role(uuid, text) to authenticated;

-- Moves `target` out of `hid` into a fresh solo household they own, taking their private
-- ("mine") items with them. Shared items stay with the household.
create or replace function public.detach_household_member(hid uuid, target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new_hid uuid;
  dname text;
begin
  select coalesce(nullif(btrim(display_name), ''), 'You') into dname from public.profiles where id = target;

  delete from public.household_members where household_id = hid and user_id = target;

  insert into public.households (name) values (dname || '''s kitchen') returning id into new_hid;
  insert into public.household_members (household_id, user_id, role) values (new_hid, target, 'owner');
  update public.profiles set household_id = new_hid, updated_at = now() where id = target;

  update public.items
  set household_id = new_hid, updated_at = now()
  where household_id = hid and scope = 'mine' and owner_user_id = target;
end;
$$;

-- Internal helper with no permission checks of its own. Supabase grants EXECUTE on new
-- public functions to anon and authenticated explicitly, so revoke from both, not just public.
revoke all on function public.detach_household_member(uuid, uuid) from public, anon, authenticated;

create or replace function public.remove_household_member(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  my_role text;
  target_role text;
begin
  select household_id into hid from public.profiles where id = uid;
  if hid is null then return jsonb_build_object('ok', false, 'error', 'no_household'); end if;
  if target = uid then return jsonb_build_object('ok', false, 'error', 'use_leave'); end if;

  my_role := public.my_household_role(hid);
  select role into target_role from public.household_members where household_id = hid and user_id = target;
  if target_role is null then return jsonb_build_object('ok', false, 'error', 'not_a_member'); end if;

  if not (
    my_role = 'owner'
    or (my_role = 'admin' and target_role = 'member')
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  perform public.detach_household_member(hid, target);
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.remove_household_member(uuid) to authenticated;

create or replace function public.leave_household()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  member_count int;
begin
  select household_id into hid from public.profiles where id = uid;
  if hid is null then return jsonb_build_object('ok', false, 'error', 'no_household'); end if;
  select count(*)::int into member_count from public.household_members where household_id = hid;
  if member_count <= 1 then return jsonb_build_object('ok', false, 'error', 'already_solo'); end if;
  if public.my_household_role(hid) = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_must_transfer');
  end if;

  perform public.detach_household_member(hid, uid);
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.leave_household() to authenticated;

-- join_household with one more guard: an owner can't walk out of a household that still
-- has other members (it would be left without an owner). Otherwise unchanged.
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
    elsif public.my_household_role(old_hid) = 'owner' then
      return jsonb_build_object('ok', false, 'error', 'owner_must_transfer');
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

-- >>> supabase/patches/household_activity_and_recalls.sql

-- Run in Supabase SQL editor for remote push notifications:
--   1. "Sam added Milk" pushes when a household member adds, uses up, tosses or deletes a
--      shared item (private "mine" items never notify anyone).
--   2. Recall alerts: FDA food recalls matched by barcode against items you own.
--
-- Flow: triggers write household_activity rows; the recall-sync function writes
-- item_recall_alerts. The notification-dispatch function (run every minute, see the
-- scheduling section at the bottom) groups unsent rows and sends them through the Expo
-- push service to each recipient's registered devices.

-- ---------------------------------------------------------------------------
-- Device push tokens
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  token text primary key check (char_length(token) between 10 and 300),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_select on public.push_tokens;
create policy push_tokens_select on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_tokens_insert on public.push_tokens;
create policy push_tokens_insert on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists push_tokens_update on public.push_tokens;
create policy push_tokens_update on public.push_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_tokens_delete on public.push_tokens;
create policy push_tokens_delete on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- A device that changes hands (sign out, sign in as someone else) re-registers its token.
create or replace function public.register_push_token(device_token text, device_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (device_token, auth.uid(), device_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

grant execute on function public.register_push_token(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notification preferences: two new opt-out switches
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_notification_settings(raw jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    jsonb_typeof(raw) = 'object'
    and (not (raw ? 'masterEnabled') or jsonb_typeof(raw->'masterEnabled') = 'boolean')
    and (not (raw ? 'notificationStyle') or (raw->>'notificationStyle') in ('individual', 'digest'))
    and (not (raw ? 'notifySoon') or jsonb_typeof(raw->'notifySoon') = 'boolean')
    and (not (raw ? 'notifyToday') or jsonb_typeof(raw->'notifyToday') = 'boolean')
    and (not (raw ? 'notifyOverdue') or jsonb_typeof(raw->'notifyOverdue') = 'boolean')
    and (not (raw ? 'includeMine') or jsonb_typeof(raw->'includeMine') = 'boolean')
    and (not (raw ? 'notifyHouseholdActivity') or jsonb_typeof(raw->'notifyHouseholdActivity') = 'boolean')
    and (not (raw ? 'notifyRecalls') or jsonb_typeof(raw->'notifyRecalls') = 'boolean')
    and (
      not (raw ? 'defaultSoonDays')
      or (jsonb_typeof(raw->'defaultSoonDays') = 'number' and (raw->>'defaultSoonDays')::int between 1 and 30)
    )
    and (not (raw ? 'soonHour') or (jsonb_typeof(raw->'soonHour') = 'number' and (raw->>'soonHour')::int between 0 and 23))
    and (not (raw ? 'todayHour') or (jsonb_typeof(raw->'todayHour') = 'number' and (raw->>'todayHour')::int between 0 and 23))
    and (
      not (raw ? 'overdueHour')
      or (jsonb_typeof(raw->'overdueHour') = 'number' and (raw->>'overdueHour')::int between 0 and 23)
    )
    and (
      not (raw ? 'digestHour')
      or (jsonb_typeof(raw->'digestHour') = 'number' and (raw->>'digestHour')::int between 0 and 23)
    )
    and (
      not (raw ? 'digestMinute')
      or (jsonb_typeof(raw->'digestMinute') = 'number' and (raw->>'digestMinute')::int between 0 and 59)
    );
$$;

-- ---------------------------------------------------------------------------
-- Household activity
-- ---------------------------------------------------------------------------

create table if not exists public.household_activity (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid,
  item_name text not null,
  action text not null check (action in ('added', 'used', 'tossed', 'removed')),
  created_at timestamptz not null default now(),
  -- Set when a dispatch run takes the row; pushed_at once the push went out. A claim older
  -- than 5 minutes without pushed_at means that run failed, and the row is retried.
  claimed_at timestamptz,
  pushed_at timestamptz
);

create index if not exists household_activity_unpushed_idx
  on public.household_activity (created_at) where pushed_at is null;
create index if not exists household_activity_household_idx
  on public.household_activity (household_id, created_at desc);

alter table public.household_activity enable row level security;

drop policy if exists household_activity_select on public.household_activity;
create policy household_activity_select on public.household_activity
  for select to authenticated
  using (household_id in (select public.user_household_ids()));

create or replace function public.log_household_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  act text;
  row_ public.items%rowtype;
begin
  -- Service-role writes (syncs, maintenance) have no actor and notify nobody.
  if actor is null then return null; end if;

  if tg_op = 'INSERT' then
    row_ := new;
    act := 'added';
  elsif tg_op = 'DELETE' then
    row_ := old;
    act := case when old.status = 'active' then 'removed' else null end;
  else
    row_ := new;
    act := case
      when old.status = 'active' and new.status = 'consumed' then 'used'
      when old.status = 'active' and new.status = 'trashed' then 'tossed'
      else null
    end;
  end if;

  if act is null or row_.scope <> 'ours' then return null; end if;

  insert into public.household_activity (household_id, actor_id, item_id, item_name, action)
  values (row_.household_id, actor, row_.id, row_.name, act);
  return null;
end;
$$;

drop trigger if exists items_log_household_activity on public.items;
create trigger items_log_household_activity
  after insert or update of status or delete on public.items
  for each row execute function public.log_household_activity();

-- ---------------------------------------------------------------------------
-- Recalls
-- ---------------------------------------------------------------------------

create table if not exists public.product_recalls (
  recall_number text primary key,
  source text not null default 'fda',
  product_description text not null,
  reason text,
  recalling_firm text,
  classification text,
  status text,
  report_date date,
  -- Every barcode found in the recall text, left-padded to 14 digits (GTIN-14) so UPC-A
  -- and EAN-13 spellings of the same code compare equal.
  gtins text[] not null default '{}',
  url text,
  fetched_at timestamptz not null default now()
);

create index if not exists product_recalls_gtins_idx on public.product_recalls using gin (gtins);

alter table public.product_recalls enable row level security;

-- Public FDA data: any signed-in user may read it.
drop policy if exists product_recalls_select on public.product_recalls;
create policy product_recalls_select on public.product_recalls
  for select to authenticated using (true);

create table if not exists public.item_recall_alerts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  recall_number text not null references public.product_recalls (recall_number) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  pushed_at timestamptz,
  dismissed_at timestamptz,
  unique (item_id, recall_number)
);

create index if not exists item_recall_alerts_household_idx on public.item_recall_alerts (household_id);
create index if not exists item_recall_alerts_unpushed_idx
  on public.item_recall_alerts (created_at) where pushed_at is null;

alter table public.item_recall_alerts enable row level security;

-- Visible exactly when the item is: shared items to the household, private ones to their owner.
drop policy if exists item_recall_alerts_select on public.item_recall_alerts;
create policy item_recall_alerts_select on public.item_recall_alerts
  for select to authenticated
  using (
    exists (
      select 1 from public.items i
      join public.household_members hm on hm.household_id = i.household_id and hm.user_id = auth.uid()
      where i.id = item_recall_alerts.item_id
        and (i.scope = 'ours' or i.owner_user_id = auth.uid())
    )
  );

create or replace function public.dismiss_recall_alert(alert_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.item_recall_alerts a
  set dismissed_at = now()
  where a.id = alert_id
    and exists (
      select 1 from public.items i
      join public.household_members hm on hm.household_id = i.household_id and hm.user_id = auth.uid()
      where i.id = a.item_id and (i.scope = 'ours' or i.owner_user_id = auth.uid())
    );
end;
$$;

grant execute on function public.dismiss_recall_alert(uuid) to authenticated;

-- Matches active items against recalls. Called by recall-sync for the recalls it just
-- stored, and by the items trigger below for a newly scanned item. Returns new alert count.
create or replace function public.match_item_recalls(recall_numbers text[] default null, only_item uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int;
begin
  insert into public.item_recall_alerts (item_id, household_id, recall_number)
  select i.id, i.household_id, r.recall_number
  from public.items i
  join public.product_recalls r on lpad(i.barcode, 14, '0') = any (r.gtins)
  where i.status = 'active'
    and i.barcode is not null
    and (recall_numbers is null or r.recall_number = any (recall_numbers))
    and (only_item is null or i.id = only_item)
    and coalesce(r.status, '') <> 'Terminated'
  on conflict (item_id, recall_number) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.match_item_recalls(text[], uuid) from public, anon, authenticated;

create or replace function public.check_item_recalls()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.barcode is not null and new.status = 'active' then
    perform public.match_item_recalls(null, new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists items_check_recalls on public.items;
create trigger items_check_recalls
  after insert or update of barcode on public.items
  for each row execute function public.check_item_recalls();

-- ---------------------------------------------------------------------------
-- Dispatch claims: overlapping runs never take the same row, and a failed send is retried
-- ---------------------------------------------------------------------------

create or replace function public.claim_household_activity(settle_seconds int default 20, max_rows int default 500)
returns setof public.household_activity
language sql
security definer
set search_path = public
as $$
  update public.household_activity a
  set claimed_at = now()
  where a.id in (
    select id from public.household_activity
    where pushed_at is null
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
      and created_at < now() - make_interval(secs => settle_seconds)
    order by created_at
    limit max_rows
    for update skip locked
  )
  returning a.*;
$$;

create or replace function public.claim_recall_alerts(max_rows int default 200)
returns setof public.item_recall_alerts
language sql
security definer
set search_path = public
as $$
  update public.item_recall_alerts a
  set claimed_at = now()
  where a.id in (
    select id from public.item_recall_alerts
    where pushed_at is null
      and dismissed_at is null
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by created_at
    limit max_rows
    for update skip locked
  )
  returning a.*;
$$;

revoke all on function public.claim_household_activity(int, int) from public, anon, authenticated;
revoke all on function public.claim_recall_alerts(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling (run once, after deploying the functions)
-- ---------------------------------------------------------------------------
-- Needs the pg_cron and pg_net extensions (Dashboard → Database → Extensions) and two
-- Vault secrets: project_url (https://<ref>.supabase.co) and service_role_key.
--
-- select vault.create_secret('https://<ref>.supabase.co', 'project_url');
-- select vault.create_secret('<service role key>', 'service_role_key');
--
-- select cron.schedule('freshkeep-notification-dispatch', '* * * * *', $cron$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notification-dispatch',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
--   );
-- $cron$);
--
-- select cron.schedule('freshkeep-recall-sync', '17 */6 * * *', $cron$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/recall-sync',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
--   );
-- $cron$);
