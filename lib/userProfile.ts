import { supabase } from "@/lib/supabase";

export type BodyFatEntry = { id: string; recorded_on: string; percent: number };

export type ProfileDetails = {
  display_name: string | null;
  username: string | null;
  created_at: string;
};

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Lowercases and strips a leading "@"; the database stores usernames lowercase. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function usernameError(username: string): string | null {
  if (!username) return null; // clearing it is allowed
  if (!USERNAME_PATTERN.test(username)) return "Use 3–20 letters, numbers or underscores.";
  return null;
}

/** Parses "18", "18.5" or "18,5"; null unless it is a plausible body-fat percentage. */
export function parseBodyFatPercent(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  if (!raw.trim() || !Number.isFinite(n) || n < 2 || n > 70) return null;
  return Math.round(n * 10) / 10;
}

export type BodyFatSummary = {
  latest: BodyFatEntry;
  /** Points changed since the previous reading (negative = down); null with one reading. */
  sincePrevious: number | null;
  /** Points changed since the first reading; null with one reading. */
  sinceFirst: number | null;
  first: BodyFatEntry;
};

/** `entries` in any order. */
export function summarizeBodyFat(entries: BodyFatEntry[]): BodyFatSummary | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const diff = (a: number, b: number) => Math.round((a - b) * 10) / 10;
  return {
    latest,
    first,
    sincePrevious: previous ? diff(latest.percent, previous.percent) : null,
    sinceFirst: sorted.length > 1 ? diff(latest.percent, first.percent) : null,
  };
}

/** Whole days since the account was created, and a short "1 year, 2 months" style label. */
export function tenure(createdAtIso: string, now: Date = new Date()): { days: number; label: string } {
  const start = new Date(createdAtIso);
  const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
  if (days < 1) return { days, label: "Joined today" };
  if (days < 31) return { days, label: `${days} day${days === 1 ? "" : "s"}` };
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(1, months);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (rest > 0) parts.push(`${rest} month${rest === 1 ? "" : "s"}`);
  return { days, label: parts.join(", ") };
}

export async function fetchProfileDetails(userId: string): Promise<{ data: ProfileDetails | null; error: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, username, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Profile not found." };
  return {
    data: {
      display_name: typeof data.display_name === "string" ? data.display_name : null,
      username: typeof data.username === "string" ? data.username : null,
      created_at: String(data.created_at),
    },
    error: null,
  };
}

export async function saveProfileDetails(
  userId: string,
  patch: { display_name: string | null; username: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (!error) return { error: null };
  if (error.code === "23505") return { error: "That username is taken. Try another." };
  return { error: error.message };
}

export async function fetchBodyFatEntries(): Promise<{ data: BodyFatEntry[]; error: string | null }> {
  const { data, error } = await supabase
    .from("body_fat_entries")
    .select("id, recorded_on, percent")
    .order("recorded_on", { ascending: false })
    .limit(365);
  if (error) return { data: [], error: error.message };
  const entries: BodyFatEntry[] = [];
  for (const row of data ?? []) {
    const percent = Number(row.percent);
    if (typeof row.id === "string" && typeof row.recorded_on === "string" && Number.isFinite(percent)) {
      entries.push({ id: row.id, recorded_on: row.recorded_on.slice(0, 10), percent });
    }
  }
  return { data: entries, error: null };
}

/** Upserts on (user, day): logging twice in one day keeps the latest reading. */
export async function logBodyFat(userId: string, recordedOn: string, percent: number): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("body_fat_entries")
    .upsert({ user_id: userId, recorded_on: recordedOn, percent }, { onConflict: "user_id,recorded_on" });
  return { error: error?.message ?? null };
}

export async function deleteBodyFat(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("body_fat_entries").delete().eq("id", id);
  return { error: error?.message ?? null };
}
