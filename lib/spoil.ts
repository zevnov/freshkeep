import type { FreshnessBand, ItemRow, ItemStatus } from "@/types";

/** Calendar date string YYYY-MM-DD in local timezone */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    throw new RangeError(`Invalid local date: ${ymd}`);
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new RangeError(`Invalid local date: ${ymd}`);
  }

  const parsed = new Date(y, m - 1, d);
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() !== m - 1 ||
    parsed.getDate() !== d
  ) {
    throw new RangeError(`Invalid local date: ${ymd}`);
  }

  return parsed;
}

export function addDaysLocal(ymd: string, days: number): string {
  const d = parseLocalDate(ymd);
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

export function spoilOnFromShelf(referenceYmd: string, shelfLifeDays: number): string {
  return addDaysLocal(referenceYmd, shelfLifeDays);
}

export function computeFreshnessBand(
  spoilOnYmd: string,
  soonDays: number,
  todayYmd: string = toLocalDateString(new Date())
): FreshnessBand {
  if (todayYmd > spoilOnYmd) return "overdue";
  if (todayYmd === spoilOnYmd) return "today";
  const soonStart = addDaysLocal(spoilOnYmd, -Math.max(1, soonDays));
  if (todayYmd >= soonStart) return "soon";
  return "fresh";
}

export function bandLabel(band: FreshnessBand): string {
  switch (band) {
    case "fresh":
      return "Good";
    case "soon":
      return "Use soon";
    case "today":
      return "Today";
    case "overdue":
      return "Overdue";
  }
}

export function formatSpoilDate(ymd: string): string {
  const d = parseLocalDate(ymd);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function daysUntilSpoil(spoilOnYmd: string, todayYmd: string = toLocalDateString(new Date())): number {
  const t = parseLocalDate(todayYmd).getTime();
  const s = parseLocalDate(spoilOnYmd).getTime();
  return Math.round((s - t) / (1000 * 60 * 60 * 24));
}

export function sortItemsByUrgency(items: ItemRow[], soonDays: number): ItemRow[] {
  const today = toLocalDateString(new Date());
  return [...items].sort((a, b) => {
    if (a.spoil_on === b.spoil_on) return a.name.localeCompare(b.name);
    const ba = computeFreshnessBand(a.spoil_on, soonDays, today);
    const bb = computeFreshnessBand(b.spoil_on, soonDays, today);
    const rank: Record<FreshnessBand, number> = {
      overdue: 0,
      today: 1,
      soon: 2,
      fresh: 3,
    };
    const dr = rank[ba] - rank[bb];
    if (dr !== 0) return dr;
    return a.spoil_on.localeCompare(b.spoil_on);
  });
}

export function isActiveItem(row: ItemRow): boolean {
  return row.status === "active";
}

export function statusLabel(status: ItemStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "consumed":
      return "Used";
    case "trashed":
      return "Discarded";
  }
}
