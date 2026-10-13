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
