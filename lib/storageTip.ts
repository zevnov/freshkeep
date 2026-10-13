import type { StoragePlace } from "@/types";

const FREEZER = /\b(keep|store)\s+frozen\b|\bfreezer\b|\b-18\s*°?\s*c\b/;
const FRIDGE = /\brefrigerat|\bfridge\b|\bchilled\b|\bkeep\s+cold\b|\b[0-2]\s*°?\s*c?\s*(-|to|and)\s*[4-8]\s*°?\s*c\b/;
const COLD = String.raw`(?:refrigerat\w*|fridge|chilled|keep cold)`;
// Clauses that make refrigeration conditional on opening: "refrigerate after opening",
// "once opened, keep refrigerated". The first form must be adjacent ("keep refrigerated
// below 5°C, once opened use within 3 days" is an unconditional fridge instruction).
const AFTER_OPENING_CLAUSES = [
  new RegExp(String.raw`${COLD}\s+(?:it\s+)?(?:after|once)\s+open\w*`, "g"),
  new RegExp(String.raw`\b(?:after|once)\s+open\w*[^.;]*?${COLD}`, "g"),
];
const PANTRY = /\bcool,?\s+(and\s+)?dry\b|\broom\s+temperature\b|\bambient\b|\bcupboard\b|\bpantry\b|\bdry\s+place\b/;

/**
 * Turns a manufacturer storage instruction into where the item belongs right now.
 * "Refrigerate after opening" means the pantry until it is opened, then the fridge;
 * any unconditional refrigeration instruction wins over that.
 */
export function storageFromTip(tip: string | null | undefined, opened: boolean): StoragePlace | null {
  if (!tip) return null;
  const t = tip.toLowerCase();
  if (FREEZER.test(t)) return "freezer";
  let rest = t;
  let conditional = false;
  for (const clause of AFTER_OPENING_CLAUSES) {
    rest = rest.replace(clause, () => {
      conditional = true;
      return " ";
    });
  }
  if (FRIDGE.test(rest)) return "fridge";
  if (conditional) return opened ? "fridge" : "pantry";
  if (PANTRY.test(t)) return "pantry";
  return null;
}
