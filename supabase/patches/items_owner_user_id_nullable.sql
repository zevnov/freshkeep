-- Run in Supabase SQL editor to allow unclaimed "ours" items: owner_user_id stays
-- null until a household member claims the item. schema.sql originally shipped the
-- column as not null, which rejected every edit of a shared item with a 23502 violation.

alter table public.items alter column owner_user_id drop not null;
