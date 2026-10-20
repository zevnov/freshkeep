import { EXPIRY_KNOWLEDGE, type ExpiryItem } from "./expiryKnowledge";

const KNOWLEDGE_SUGGESTION_LIMIT = 5;

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Substring match on `name`, case-insensitive. Empty query returns `items` unchanged. */
export function filterItemsByQuery<T extends { name: string }>(items: T[], query: string): T[] {
  const q = normalizeQuery(query);
  if (!q) return items;
  return items.filter((item) => item.name.toLowerCase().includes(q));
}

type IndexedKnowledgeItem = { item: ExpiryItem; lowerName: string; lowerKeywords: string[] };

/** Lowercased once at module load — EXPIRY_KNOWLEDGE is static, so this avoids re-lowercasing ~1,000 entries and their keyword lists on every keystroke. */
const KNOWLEDGE_INDEX: IndexedKnowledgeItem[] = EXPIRY_KNOWLEDGE.map((item) => ({
  item,
  lowerName: item.name.toLowerCase(),
  lowerKeywords: item.keywords.map((k) => k.toLowerCase()),
}));

/**
 * Ranked lookup into the food knowledge base for quick-add suggestions: exact name match,
 * then name/keyword prefix, then name/keyword substring. Empty query returns no suggestions.
 */
export function searchKnowledgeBase(query: string, limit = KNOWLEDGE_SUGGESTION_LIMIT): ExpiryItem[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  const scored: { item: ExpiryItem; score: number }[] = [];
  for (const { item, lowerName, lowerKeywords } of KNOWLEDGE_INDEX) {
    let score: number | null = null;
    if (lowerName === q) score = 0;
    else if (lowerName.startsWith(q)) score = 1;
    else if (lowerKeywords.some((k) => k.startsWith(q))) score = 2;
    else if (lowerName.includes(q)) score = 3;
    else if (lowerKeywords.some((k) => k.includes(q))) score = 4;
    if (score != null) scored.push({ item, score });
  }

  scored.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name));
  return scored.slice(0, limit).map((s) => s.item);
}
