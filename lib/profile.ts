import { supabase } from "@/lib/supabase";
import type { ItemScope, NotificationPrefs, StoragePlace } from "@/types";
import { DEFAULT_NOTIFICATION_PREFS } from "@/types";

export type Profile = {
  id: string;
  display_name: string | null;
  household_id: string;
  default_bucket: ItemScope;
  default_storage: StoragePlace;
  notification_prefs: NotificationPrefs;
};

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : Number.parseInt(String(n), 10);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, x));
}

function mergePrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_NOTIFICATION_PREFS };
  const o = raw as Record<string, unknown>;
  const base = { ...DEFAULT_NOTIFICATION_PREFS, ...(raw as Partial<NotificationPrefs>) };
  return {
    ...base,
    notificationStyle: o.notificationStyle === "digest" ? "digest" : "individual",
    digestHour: clampInt(o.digestHour, 0, 23, DEFAULT_NOTIFICATION_PREFS.digestHour),
    digestMinute: clampInt(o.digestMinute, 0, 59, DEFAULT_NOTIFICATION_PREFS.digestMinute),
  };
}

const VALID_STORAGE_PLACES: readonly StoragePlace[] = ["fridge", "freezer", "pantry", "counter"];

function isStoragePlace(v: string): v is StoragePlace {
  return (VALID_STORAGE_PLACES as readonly string[]).includes(v);
}

function mapProfile(row: {
  id: string;
  display_name: string | null;
  household_id: string;
  default_bucket: string;
  default_storage: string;
  notification_settings: unknown;
}): Profile {
  return {
    id: row.id,
    display_name: row.display_name,
    household_id: row.household_id,
    default_bucket: row.default_bucket === "mine" ? "mine" : "ours",
    default_storage: isStoragePlace(row.default_storage) ? row.default_storage : "fridge",
    notification_prefs: mergePrefs(row.notification_settings),
  };
}

const PROFILE_SELECT =
  "id, display_name, household_id, default_bucket, default_storage, notification_settings" as const;

/** Fetches profile with retries (helps flaky mobile networks / cold auth). */
export async function fetchProfileForUser(userId: string): Promise<Profile | null> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();
    if (!error && data) return mapProfile(data);
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  return null;
}
