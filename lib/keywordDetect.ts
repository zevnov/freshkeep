import { EXPIRY_KNOWLEDGE, ExpiryItem } from "./expiryKnowledge";
import { fetchCommunityExpiry, type CommunityExpiryItem } from "./communityExpiry";

export interface DetectedItem {
  name: string;
  category: string;
  fridgeDays: number | null;
  freezerDays: number | null;
  perishable: boolean;
  matchedKeyword: string;
  /** "local" = curated knowledge base, "community" = crowdsourced */
  source: "local" | "community";
  /** Number of community submissions behind this data (community source only). */
  submission_count?: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `keyword` appears in `normalized` as a whole word or phrase
 * (not as a substring inside another word, e.g. "pepper" in "pepperoni").
 */
export function keywordMatchesInput(normalized: string, keyword: string): boolean {
  const kw = keyword.toLowerCase().trim();
  if (!kw) return false;
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(kw)}(?:[^a-z0-9]|$)`);
  return pattern.test(normalized);
}

function toDetected(item: ExpiryItem, matchedKeyword: string): DetectedItem {
  return {
    name: item.name,
    category: item.category,
    fridgeDays: item.fridgeDays,
    freezerDays: item.freezerDays,
    perishable: item.perishable,
    matchedKeyword,
    source: "local",
  };
}

/**
 * Detect a food item from a text string (product name, barcode lookup result, etc.)
 * Matches against the embedded expiry knowledge base.
 * Returns null if no match found.
 */
export function detectItem(input: string): DetectedItem | null {
  const normalized = input.toLowerCase().trim();
  if (!normalized) return null;

  const exact = EXPIRY_KNOWLEDGE.find((item) => item.name === normalized);
  if (exact) return toDetected(exact, exact.name);

  let best: { item: ExpiryItem; keyword: string } | null = null;
  for (const item of EXPIRY_KNOWLEDGE) {
    for (const kw of item.keywords) {
      if (!keywordMatchesInput(normalized, kw)) continue;
      if (!best || kw.length > best.keyword.length) {
        best = { item, keyword: kw };
      }
    }
  }

  if (!best) return null;
  return toDetected(best.item, best.keyword);
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

// ─── Async community fallback ────────────────────────────────────────────────

function communityToDetected(item: CommunityExpiryItem): DetectedItem {
  return {
    name: item.normalized_name,
    category: item.category,
    fridgeDays: item.fridge_days,
    freezerDays: item.freezer_days,
    perishable: item.perishable,
    matchedKeyword: item.normalized_name,
    source: "community",
    submission_count: item.submission_count,
  };
}

/**
 * Detect a food item from a text string, checking the local knowledge base
 * first and falling back to the community database if no local match exists.
 * Returns null if neither source has data for this item.
 */
export async function detectItemAsync(input: string): Promise<DetectedItem | null> {
  // Check local curated knowledge first.
  const local = detectItem(input);
  if (local) return local;

  // Fall back to community-sourced data.
  const community = await fetchCommunityExpiry(input);
  return community ? communityToDetected(community) : null;
}
