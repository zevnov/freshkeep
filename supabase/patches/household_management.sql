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
