import type { StoragePlace } from "@/types";

const FREEZER = /\b(keep|store)\s+frozen\b|\bfreezer\b|\b-18\s*°?\s*c\b/;
const FRIDGE = /\brefrigerat|\bfridge\b|\bchilled\b|\bkeep\s+cold\b|\b[0-2]\s*°?\s*c?\s*(-|to|and)\s*[4-8]\s*°?\s*c\b/;
const AFTER_OPENING =
  /(refrigerat\w*|fridge|chilled|keep cold)[^.]*\b(after|once)\s+open|\b(after|once)\s+open\w*[^.]*(refrigerat|fridge|chilled|keep cold)/;
const PANTRY = /\bcool,?\s+(and\s+)?dry\b|\broom\s+temperature\b|\bambient\b|\bcupboard\b|\bpantry\b|\bdry\s+place\b/;

/**
 * Turns a manufacturer storage instruction into where the item belongs right now.
 * "Refrigerate after opening" means the pantry until it is opened, then the fridge.
 */
export function storageFromTip(tip: string | null | undefined, opened: boolean): StoragePlace | null {
  if (!tip) return null;
  const t = tip.toLowerCase();
  if (FREEZER.test(t)) return "freezer";
  if (AFTER_OPENING.test(t)) return opened ? "fridge" : "pantry";
  if (FRIDGE.test(t)) return "fridge";
  if (PANTRY.test(t)) return "pantry";
  return null;
}
