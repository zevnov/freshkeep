import type { BarcodeLookupResult } from "@/lib/barcodeLookup";

/**
 * Hands a picked product (from the scanner or quick-add search) to the add-item form.
 * Route params only carry strings, and nutrition is a nested object, so the product stays
 * in memory and only an opaque token travels in the URL. One slot is enough: the form
 * takes the product as soon as it mounts.
 */
let pending: { token: string; product: BarcodeLookupResult } | null = null;

export function stashProduct(product: BarcodeLookupResult): string {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  pending = { token, product };
  return token;
}

export function takeProduct(token: string | undefined): BarcodeLookupResult | null {
  if (!token || !pending || pending.token !== token) return null;
  const { product } = pending;
  pending = null;
  return product;
}
