import { PRODUCE_KNOWLEDGE } from "./expiryKnowledge";

export interface DetectedItem {
  name: string;
  category: string;
  fridgeDays: number | null;
  freezerDays: number | null;
  perishable: boolean;
  matchedKeyword: string;
}

/**
 * Detect a food item from a text string (product name, barcode lookup result, etc.)
 * Matches against the embedded produce knowledge base.
 * Returns null if no match found.
 */
export function detectItem(input: string): DetectedItem | null {
  const normalized = input.toLowerCase().trim();
  if (!normalized) return null;

  // 1. Try exact name match first
  let match = PRODUCE_KNOWLEDGE.find((item) => item.name === normalized);

  // 2. Try keyword matching (check if any keyword appears in the input)
  if (!match) {
    match = PRODUCE_KNOWLEDGE.find((item) =>
      item.keywords.some((kw) => normalized.includes(kw))
    );
  }

  if (!match) return null;

  return {
    name: match.name,
    category: match.category,
    fridgeDays: match.fridgeDays,
    freezerDays: match.freezerDays,
    perishable: match.perishable,
    matchedKeyword: match.keywords[0],
  };
}

/** Check if a detected item is non-perishable (canned, pantry, spice, etc.) */
export function isNonPerishable(item: DetectedItem): boolean {
  return !item.perishable;
}

/** Estimate expiry date based on storage type and days */
export function estimateExpiry(refDate: Date, days: number): Date {
  const d = new Date(refDate);
  d.setDate(d.getDate() + days);
  return d;
}
