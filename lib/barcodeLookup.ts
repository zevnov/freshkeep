export type BarcodeLookupResult = {
  barcode: string;
  name: string | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
};

type OpenFoodFactsProduct = {
  product_name?: string;
  brands?: string;
  quantity?: string;
};

type OpenFoodFactsResponse = {
  status: number;
  product?: OpenFoodFactsProduct;
};

function parseQuantity(raw: string | undefined): { quantity: number | null; unit: string | null } {
  if (!raw) return { quantity: null, unit: null };
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)$/);
  if (!m) return { quantity: null, unit: trimmed.slice(0, 12) || null };
  const value = Number(m[1].replace(",", "."));
  if (!Number.isFinite(value)) return { quantity: null, unit: m[2].toLowerCase() };
  return { quantity: value, unit: m[2].toLowerCase() };
}

export async function lookupBarcodeProduct(barcode: string): Promise<BarcodeLookupResult> {
  const code = barcode.trim();
  if (!/^\d{8,14}$/.test(code)) {
    return { barcode: code, name: null, quantity: null, unit: null, notes: "Barcode format not supported." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return { barcode: code, name: null, quantity: null, unit: null, notes: "Could not fetch product details." };
    }
    const body = (await res.json()) as OpenFoodFactsResponse;
    if (body.status !== 1 || !body.product) {
      return { barcode: code, name: null, quantity: null, unit: null, notes: "No product found for this barcode." };
    }

    const { quantity, unit } = parseQuantity(body.product.quantity);
    const name = body.product.product_name?.trim() || null;
    const brand = body.product.brands?.split(",")[0]?.trim();
    const notes = brand ? `Brand: ${brand}` : null;

    return { barcode: code, name, quantity, unit, notes };
  } catch {
    return { barcode: code, name: null, quantity: null, unit: null, notes: "Lookup unavailable right now." };
  } finally {
    clearTimeout(timeout);
  }
}
