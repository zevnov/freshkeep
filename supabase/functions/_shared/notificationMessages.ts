// Wording for remote pushes. Pure functions only.

export type ActivityAction = "added" | "used" | "tossed" | "removed";

const VERB: Record<ActivityAction, string> = {
  added: "added",
  used: "used up",
  tossed: "tossed",
  removed: "removed",
};

/** "Milk", "Milk and Eggs", "Milk, Eggs and Bread", "Milk, Eggs and 3 more". */
export function listNames(names: string[], max = 2): string {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return "an item";
  if (unique.length === 1) return unique[0];
  if (unique.length <= max + 1) return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
  return `${unique.slice(0, max).join(", ")} and ${unique.length - max} more`;
}

/** One push per actor and action, so a bulk scan of 20 items is one notification, not 20. */
export function activityMessage(actorName: string, action: ActivityAction, itemNames: string[]): string {
  return `${actorName} ${VERB[action]} ${listNames(itemNames)}`;
}

export type ActivityRow = { id: number; household_id: string; actor_id: string; action: ActivityAction; item_name: string };

export type ActivityGroup = { household_id: string; actor_id: string; action: ActivityAction; ids: number[]; names: string[] };

export function groupActivity(rows: ActivityRow[]): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();
  for (const r of rows) {
    const key = `${r.household_id}|${r.actor_id}|${r.action}`;
    const g = groups.get(key);
    if (g) {
      g.ids.push(r.id);
      g.names.push(r.item_name);
    } else {
      groups.set(key, { household_id: r.household_id, actor_id: r.actor_id, action: r.action, ids: [r.id], names: [r.item_name] });
    }
  }
  return [...groups.values()];
}

export function recallMessage(itemName: string, reason: string | null): { title: string; body: string } {
  const why = reason ? reason.replace(/\s+/g, " ").trim() : "";
  const short = why.length > 140 ? `${why.slice(0, 139).trimEnd()}…` : why;
  return {
    title: `Recall: ${itemName}`,
    body: short ? `A product you have was recalled. ${short}` : "A product you have was recalled. Tap for details.",
  };
}

/** Opt-out semantics: anything but an explicit `false` means "send". */
export function wantsPush(settings: unknown, key: "notifyHouseholdActivity" | "notifyRecalls"): boolean {
  if (!settings || typeof settings !== "object") return true;
  return (settings as Record<string, unknown>)[key] !== false;
}
