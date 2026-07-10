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

/**
 * Ranked lookup into the food knowledge base for quick-add suggestions: exact name match,
 * then name/keyword prefix, then name/keyword substring. Empty query returns no suggestions.
 */
export function searchKnowledgeBase(query: string, limit = KNOWLEDGE_SUGGESTION_LIMIT): ExpiryItem[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  const scored: { item: ExpiryItem; score: number }[] = [];
  for (const item of EXPIRY_KNOWLEDGE) {
    const name = item.name.toLowerCase();
    let score: number | null = null;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (item.keywords.some((k) => k.toLowerCase().startsWith(q))) score = 2;
    else if (name.includes(q)) score = 3;
    else if (item.keywords.some((k) => k.toLowerCase().includes(q))) score = 4;
    if (score != null) scored.push({ item, score });
  }

  scored.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name));
  return scored.slice(0, limit).map((s) => s.item);
}
