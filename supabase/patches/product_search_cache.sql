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
