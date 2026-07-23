import { parseLocalDate, toLocalDateString } from "@/lib/spoil";
import type { ItemRow, ItemScope, ItemStatus, StoragePlace } from "@/types";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const STORAGE: StoragePlace[] = ["fridge", "freezer", "pantry", "counter"];
const STATUSES: ItemStatus[] = ["active", "consumed", "trashed"];
const HOUSEHOLD_ROLES = ["owner", "member"] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

/** Shape returned by PostgREST for `items` (dates often ISO strings). */
export type ItemRowDb = {
  id: string;
  household_id: string;
  owner_user_id: string | null;
  scope: string;
  name: string;
  storage: string;
  spoil_on: string;
  quantity: number | string | null;
  unit: string | null;
  notes: string | null;
  remind_me: boolean;
  remind_days_before: number;
  status: string;
  schedule_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function reqString(obj: Record<string, unknown>, key: string): ParseResult<string> {
  const v = obj[key];
  if (v == null) return { ok: false, error: `missing ${key}` };
  if (typeof v === "string" && v.length > 0) return { ok: true, value: v };
  if (typeof v === "string") return { ok: false, error: `empty ${key}` };
  return { ok: false, error: `invalid ${key}` };
}

function optString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

function asFiniteInt(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function asFiniteNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseSpoilOn(raw: unknown): ParseResult<string> {
  if (raw == null) return { ok: false, error: "missing spoil_on" };
  if (typeof raw !== "string") return { ok: false, error: `invalid spoil_on type (${typeof raw})` };

  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
  if (!match) {
    return { ok: false, error: `invalid spoil_on format (${trimmed.slice(0, 24)})` };
  }

  const ymd = match[1];
  const parsed = parseLocalDate(ymd);
  if (toLocalDateString(parsed) !== ymd) {
    return { ok: false, error: `invalid spoil_on date (${ymd})` };
  }

  return { ok: true, value: ymd };
}

export function parseItemRow(raw: unknown): ParseResult<ItemRow> {
  if (!isRecord(raw)) return { ok: false, error: "item row is not an object" };

  const id = reqString(raw, "id");
  if (!id.ok) return id;
  const household_id = reqString(raw, "household_id");
  if (!household_id.ok) return household_id;
  // Nullable: unclaimed "ours" items store no owner (add-item's edit path sends owner_user_id: null).
  const owner_user_id = optString(raw.owner_user_id);
  const name = reqString(raw, "name");
  if (!name.ok) return name;

  const scopeRaw = raw.scope;
  if (scopeRaw !== "mine" && scopeRaw !== "ours") return { ok: false, error: "invalid scope" };
  const scope: ItemScope = scopeRaw;

  const storageRaw = raw.storage;
  if (typeof storageRaw !== "string" || !STORAGE.includes(storageRaw as StoragePlace)) {
    return { ok: false, error: "invalid storage" };
  }
  const storage = storageRaw as StoragePlace;

  const spoil_on = parseSpoilOn(raw.spoil_on);
  if (!spoil_on.ok) return spoil_on;

  const statusRaw = raw.status;
  if (typeof statusRaw !== "string" || !STATUSES.includes(statusRaw as ItemStatus)) {
    return { ok: false, error: "invalid status" };
  }
  const status = statusRaw as ItemStatus;

  const created_at = reqString(raw, "created_at");
  if (!created_at.ok) return created_at;
  const updated_at = reqString(raw, "updated_at");
  if (!updated_at.ok) return updated_at;

  return {
    ok: true,
    value: {
      id: id.value,
      household_id: household_id.value,
      owner_user_id,
      scope,
      name: name.value,
      storage,
      spoil_on: spoil_on.value,
      quantity: asFiniteNumber(raw.quantity),
      unit: optString(raw.unit),
      notes: optString(raw.notes),
      remind_me: Boolean(raw.remind_me),
      remind_days_before: asFiniteInt(raw.remind_days_before, 0),
      status,
      schedule_version: asFiniteInt(raw.schedule_version, 0),
      created_by: raw.created_by == null ? null : optString(raw.created_by),
      created_at: created_at.value,
      updated_at: updated_at.value,
    },
  };
}

export type HouseholdMemberParsed = { user_id: string; role: HouseholdRole };

export function parseHouseholdMemberRow(raw: unknown): ParseResult<HouseholdMemberParsed> {
  if (!isRecord(raw)) return { ok: false, error: "member row is not an object" };
  const user_id = reqString(raw, "user_id");
  if (!user_id.ok) return user_id;
  const roleRaw = raw.role;
  if (typeof roleRaw !== "string" || !HOUSEHOLD_ROLES.includes(roleRaw as HouseholdRole)) {
    return { ok: false, error: "invalid role" };
  }
  return { ok: true, value: { user_id: user_id.value, role: roleRaw as HouseholdRole } };
}

export type InviteRowParsed = { code: string; expires_at: string };

export function parseInviteRow(raw: unknown): ParseResult<InviteRowParsed> {
  if (!isRecord(raw)) return { ok: false, error: "invite row is not an object" };
  const code = reqString(raw, "code");
  if (!code.ok) return code;
  const expires_at = reqString(raw, "expires_at");
  if (!expires_at.ok) return expires_at;
  const exp = new Date(expires_at.value).getTime();
  if (!Number.isFinite(exp)) return { ok: false, error: "invalid expires_at" };
  return { ok: true, value: { code: code.value, expires_at: expires_at.value } };
}

export type ProfileIdDisplay = { id: string; display_name: string | null };

export function parseProfileIdDisplay(raw: unknown): ParseResult<ProfileIdDisplay> {
  if (!isRecord(raw)) return { ok: false, error: "profile row is not an object" };
  const id = reqString(raw, "id");
  if (!id.ok) return id;
  const dn = raw.display_name;
  if (dn != null && typeof dn !== "string") return { ok: false, error: "invalid display_name" };
  const display_name: string | null = typeof dn === "string" ? dn : null;
  return { ok: true, value: { id: id.value, display_name } };
}

/** RPC `create_household_invite` returns the same fields as a stored invite row. */
export const parseInviteRpcRow = parseInviteRow;
