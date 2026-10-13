import { supabase } from "@/lib/supabase";
import type { HouseholdRole } from "@/lib/supabaseRows";

export const ROLE_LABEL: Record<HouseholdRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const ROLE_DESCRIPTION: Record<HouseholdRole, string> = {
  owner: "Can do everything, including changing roles",
  admin: "Can rename the household and remove members",
  member: "Can add, edit and use up items",
};

export function canRenameHousehold(role: HouseholdRole | null): boolean {
  return role === "owner" || role === "admin";
}

/** Mirrors remove_household_member: owners remove anyone else, admins remove plain members. */
export function canRemoveMember(actor: HouseholdRole | null, target: HouseholdRole, isSelf: boolean): boolean {
  if (isSelf || !actor) return false;
  if (actor === "owner") return true;
  return actor === "admin" && target === "member";
}

/** Roles the owner can move another member to (the target's current role excluded). */
export function roleChoices(actor: HouseholdRole | null, target: HouseholdRole, isSelf: boolean): HouseholdRole[] {
  if (actor !== "owner" || isSelf) return [];
  return (["admin", "member", "owner"] as const).filter((r) => r !== target);
}

/** Owners first, then admins, then members; alphabetical within a role. */
export function sortMembers<T extends { role: HouseholdRole; display_name: string | null }>(members: T[]): T[] {
  const rank: Record<HouseholdRole, number> = { owner: 0, admin: 1, member: 2 };
  return [...members].sort(
    (a, b) => rank[a.role] - rank[b.role] || (a.display_name ?? "").localeCompare(b.display_name ?? "")
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "You don't have permission to do that.",
  invalid_name: "Use 1–60 characters for the household name.",
  invalid_role: "That role isn't available.",
  not_a_member: "That person isn't in this household anymore.",
  cannot_change_own_role: "You can't change your own role.",
  owner_must_transfer: "You own this household. Make someone else the owner first.",
  already_solo: "You're the only one here already.",
  no_household: "Couldn't find your household.",
};

type RpcResult = { error: string | null };

async function callRpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error: error.message };
  const res = data as { ok?: boolean; error?: string } | null;
  if (!res?.ok) return { error: (res?.error && ERROR_MESSAGES[res.error]) || "Something went wrong." };
  return { error: null };
}

export const renameHousehold = (name: string) => callRpc("rename_household", { new_name: name });
export const setMemberRole = (userId: string, role: HouseholdRole) =>
  callRpc("set_household_member_role", { target: userId, new_role: role });
export const removeMember = (userId: string) => callRpc("remove_household_member", { target: userId });
export const leaveHousehold = () => callRpc("leave_household", {});
