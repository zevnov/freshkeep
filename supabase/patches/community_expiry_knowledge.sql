-- Community-driven expiry knowledge base.
-- Users submit shelf-life data for items not in the curated local knowledge base.
-- First submission creates the row; subsequent submissions average the days
-- and increment submission_count for confidence weighting.

create table if not exists public.community_expiry_knowledge (
  normalized_name text primary key,
  category text not null default 'community',
  fridge_days int,
  freezer_days int,
  perishable boolean not null default true,
  submission_count int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_expiry_updated_at_idx
  on public.community_expiry_knowledge (updated_at desc);

alter table public.community_expiry_knowledge enable row level security;

-- Any authenticated user can read community knowledge.
drop policy if exists community_expiry_select on public.community_expiry_knowledge;
create policy community_expiry_select on public.community_expiry_knowledge
  for select to authenticated
  using (true);

-- Writes go exclusively through the submit_community_expiry() function below.
-- No direct INSERT/UPDATE policies — clients cannot write to the table.
drop policy if exists community_expiry_insert on public.community_expiry_knowledge;
drop policy if exists community_expiry_update on public.community_expiry_knowledge;

-- Atomic submission: inserts on first submission, otherwise averages the days
-- values (weighted by submission_count) in a single statement so concurrent
-- submissions cannot lose data.
create or replace function public.submit_community_expiry(
  p_name text,
  p_category text,
  p_fridge_days int,
  p_freezer_days int,
  p_perishable boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Defensive validation: this function is the only write path (RLS blocks
  -- direct table access), so a misbehaving or malicious authenticated client
  -- could otherwise insert junk that skews the shared running average.
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 120 then
    raise exception 'invalid p_name';
  end if;
  if p_fridge_days is not null and (p_fridge_days <= 0 or p_fridge_days > 3650) then
    raise exception 'invalid p_fridge_days';
  end if;
  if p_freezer_days is not null and (p_freezer_days <= 0 or p_freezer_days > 3650) then
    raise exception 'invalid p_freezer_days';
  end if;

  insert into community_expiry_knowledge (normalized_name, category, fridge_days, freezer_days, perishable, submission_count)
  values (p_name, p_category, p_fridge_days, p_freezer_days, p_perishable, 1)
  on conflict (normalized_name) do update set
    fridge_days = case when p_fridge_days is not null and community_expiry_knowledge.fridge_days is not null
      then round((community_expiry_knowledge.fridge_days * community_expiry_knowledge.submission_count + p_fridge_days)::numeric / (community_expiry_knowledge.submission_count + 1))
      else coalesce(p_fridge_days, community_expiry_knowledge.fridge_days) end,
    freezer_days = case when p_freezer_days is not null and community_expiry_knowledge.freezer_days is not null
      then round((community_expiry_knowledge.freezer_days * community_expiry_knowledge.submission_count + p_freezer_days)::numeric / (community_expiry_knowledge.submission_count + 1))
      else coalesce(p_freezer_days, community_expiry_knowledge.freezer_days) end,
    submission_count = community_expiry_knowledge.submission_count + 1,
    updated_at = now();
end;
$$;

-- Supabase's default privileges grant EXECUTE directly to anon/authenticated/
-- service_role on every new function, bypassing the PUBLIC pseudo-role — so
-- "revoke ... from public" alone does not stop anonymous callers. Revoke from
-- anon explicitly; service_role already bypasses RLS everywhere and is never
-- exposed to clients, so it's left with EXECUTE.
revoke execute on function public.submit_community_expiry(text, text, int, int, boolean) from public;
revoke execute on function public.submit_community_expiry(text, text, int, int, boolean) from anon;
grant execute on function public.submit_community_expiry(text, text, int, int, boolean) to authenticated;
