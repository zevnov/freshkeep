-- Fix every UPDATE on items failing with "infinite recursion detected in policy for relation items".
-- Cause: items_update's with check enforced created_by immutability with a subquery on items
-- itself (added in b5e3ee3), so evaluating the policy re-entered the items policies.
-- This breaks editing an item, "Mark as used", "Discard", and offline-queued edits.
-- Fix: drop that condition from the policy and enforce immutability with a BEFORE UPDATE trigger.
--
-- Run once in Supabase SQL Editor (Dashboard → SQL → New query).

drop policy if exists items_update on public.items;
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
