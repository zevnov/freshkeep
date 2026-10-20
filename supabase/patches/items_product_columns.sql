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
