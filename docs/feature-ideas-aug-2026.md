# August 2026 feature ideas: setup and rollout

Branch `feat/aug-2026-feature-ideas` builds the nine ideas from the 8/24/26 one-pager. Most of
the app code works as soon as the database is migrated. Pushes and recalls also need
functions deployed and two scheduled jobs.

## What shipped

| Idea | Where |
|---|---|
| Nutrition on scan | Scan result card (photo, name, kcal, protein/carb/fat pills); item detail. Data: Open Food Facts via `barcode-lookup` |
| Popular-brand quick add | `app/quick-add.tsx` (Home → ⚡ Quick add, or Add item → Search brands). `product-search` function, most-scanned products first |
| Storage recommendations | Manufacturer `conservation_conditions` from Open Food Facts, shown on the card; sets the storage picker ("refrigerate after opening" = pantry until opened) |
| Individual profiles | Settings → Profile: display name, unique @username, time on Freshkeep, items added, private body-fat log |
| Family activity pushes | "Sam added Milk, Eggs and 3 more", grouped per person per minute. Shared items only |
| Custom food icons | Emoji picker on add/edit; automatic per-food defaults |
| Category sorting | Home sort chips: Use first, Food type (grouped), Date added, A–Z |
| Recall tracking | FDA food recalls matched by barcode; home banner, item detail card, push; opt-out in Settings |
| Household view | Rename, admin role, change roles / hand over ownership, remove members, leave, share invite |

## Rollout order

The app inserts the new item columns on every add, so **migrate the database before
shipping the app build**. Otherwise adding items fails.

### 1. SQL (Supabase SQL editor), in this order

1. `supabase/patches/items_product_columns.sql`
2. `supabase/patches/product_search_cache.sql`
3. `supabase/patches/profiles_username_body_fat.sql`
4. `supabase/patches/household_management.sql`
5. `supabase/patches/household_activity_and_recalls.sql` (skip the commented scheduling block for now)

New projects can run `supabase/schema.sql`, which now ends with the same five patches.

### 2. Edge functions

```sh
supabase functions deploy barcode-lookup
supabase functions deploy product-search
supabase functions deploy notification-dispatch --no-verify-jwt
supabase functions deploy recall-sync --no-verify-jwt
```

`notification-dispatch` and `recall-sync` check for the service-role key themselves; only the
scheduler calls them. Optional secrets:

- `EXPO_ACCESS_TOKEN`: only if Expo enhanced push security is on.
- `OPENFDA_API_KEY`: raises openFDA's daily quota. Not needed at 4 runs a day.

Cached barcode lookups from before this change are refetched automatically: rows without
nutrition data count as cache misses.

### 3. Schedules

Turn on `pg_cron` and `pg_net` (Dashboard → Database → Extensions). Then run the commented
block at the bottom of `household_activity_and_recalls.sql`. It stores the project URL and the
service-role key in Vault and schedules both jobs: dispatch every minute, recall sync every
6 hours.

### 4. Remote push on devices

Local spoil reminders already work. Remote pushes (household activity and recalls) also need:

- An **EAS project id**. Run `eas init`, which writes `extra.eas.projectId` to the app config.
  Without it the app skips push registration silently.
- **Android**: FCM credentials uploaded to EAS (`eas credentials`), plus `google-services.json`.
- **iOS**: an APNs key, which EAS can create during `eas build`.
- A new dev/production build. Expo Go can't receive these pushes on Android.

## Known limits

- **Recall coverage**: only FDA recalls that print a UPC/EAN in their text are matched. Many
  don't, and USDA (meat and poultry) recalls aren't included. A match is by product, not lot,
  so the alert asks people to check their package's lot or best-by code.
- **Open Food Facts data quality**: nutrition and storage text depend on what contributors
  entered. Storage instructions are often missing outside Europe.
- **Search rate limit**: Open Food Facts allows about 10 searches a minute per server IP.
  Results are cached per query for 72 hours, and the client waits for a pause in typing
  (450 ms) and needs 3+ characters.
- **Invites**: any member can still create invite codes, as before. Restricting that to
  owners and admins is a one-line change in `create_household_invite` if wanted.
