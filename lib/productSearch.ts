import { parseProductResult, type BarcodeLookupResult } from "@/lib/barcodeLookup";
import { supabase } from "@/lib/supabase";
import type { ItemRow } from "@/types";

export const MIN_SEARCH_LENGTH = 3;

export type ProductSearchResult = { products: BarcodeLookupResult[]; error: string | null };

/** Branded products matching `query`, most-scanned first (Open Food Facts, via the product-search function). */
export async function searchProducts(query: string): Promise<ProductSearchResult> {
  const q = query.trim();
  if (q.length < MIN_SEARCH_LENGTH) return { products: [], error: null };
  try {
    const invoke = supabase.functions.invoke<unknown>("product-search", { body: { query: q } });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000));
    const { data, error } = await Promise.race([invoke, timeout]);
    if (error) return { products: [], error: "Search is unavailable right now. Try again in a minute." };
    const raw = (data as { products?: unknown } | null)?.products;
    const products = Array.isArray(raw)
      ? raw.map(parseProductResult).filter((p): p is BarcodeLookupResult => p != null && p.name != null)
      : [];
    return { products, error: null };
  } catch (e) {
    const timedOut = e instanceof Error && e.message === "timeout";
    return { products: [], error: timedOut ? "Search timed out. Try again." : "Search is unavailable right now." };
  }
}

/** Products this household added before (newest first, one per barcode) for one-tap re-adding. */
export function recentProducts(items: ItemRow[], limit = 12): BarcodeLookupResult[] {
  const sorted = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const seen = new Set<string>();
  const out: BarcodeLookupResult[] = [];
  for (const item of sorted) {
    if (!item.barcode || seen.has(item.barcode)) continue;
    seen.add(item.barcode);
    out.push({
      barcode: item.barcode,
      name: item.name,
      brand: item.brand,
      quantity: item.quantity,
      unit: item.unit,
      image_url: item.image_url,
      nutrition: item.nutrition,
      storage_tip: item.storage_tip,
      notes: null,
    });
    if (out.length >= limit) break;
  }
  return out;
}
