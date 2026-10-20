import { categoryIcon } from "@/lib/foodIcons";
import { detectItem } from "@/lib/keywordDetect";
import { sortItemsByUrgency } from "@/lib/spoil";
import type { ItemRow } from "@/types";

export type ItemSort = "urgency" | "type" | "added" | "az";

export const ITEM_SORT_OPTIONS: { key: ItemSort; label: string }[] = [
  { key: "urgency", label: "Use first" },
  { key: "type", label: "Food type" },
  { key: "added", label: "Date added" },
  { key: "az", label: "A–Z" },
];

export function isItemSort(v: unknown): v is ItemSort {
  return ITEM_SORT_OPTIONS.some((o) => o.key === v);
}

/** Stored category, else detected from the name (items saved before categories existed), else null. */
export function itemCategory(item: Pick<ItemRow, "category" | "name">): string | null {
  return item.category ?? detectItem(item.name)?.category ?? null;
}

export function categoryLabel(category: string | null): string {
  if (!category) return "Other";
  return category.charAt(0).toUpperCase() + category.slice(1);
}

const byName = (a: ItemRow, b: ItemRow) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export function sortItems(items: ItemRow[], sort: ItemSort, soonDays: number): ItemRow[] {
  switch (sort) {
    case "az":
      return [...items].sort(byName);
    case "added":
      return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at) || byName(a, b));
    case "type":
      return groupByCategory(items, soonDays).flatMap((g) => g.items);
    case "urgency":
    default:
      return sortItemsByUrgency(items, soonDays);
  }
}

export type CategoryGroup = { category: string | null; label: string; icon: string; items: ItemRow[] };

/** Groups alphabetically by category ("Other" last); most urgent first inside each group. */
export function groupByCategory(items: ItemRow[], soonDays: number): CategoryGroup[] {
  const groups = new Map<string | null, ItemRow[]>();
  for (const item of items) {
    const c = itemCategory(item);
    const list = groups.get(c);
    if (list) list.push(item);
    else groups.set(c, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : a.localeCompare(b)))
    .map(([category, list]) => ({
      category,
      label: categoryLabel(category),
      icon: categoryIcon(category),
      items: sortItemsByUrgency(list, soonDays),
    }));
}
