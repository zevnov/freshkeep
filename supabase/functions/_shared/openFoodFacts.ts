// Open Food Facts → Freshkeep product shape. Pure functions only (no Deno or network), so the
// edge functions share one normalizer and Jest can test it from the app side.

export type ProductNutrition = {
  basis: "serving" | "100g";
  serving_size: string | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type ProductInfo = {
  barcode: string;
  name: string | null;
  brand: string | null;
  quantity: number | null;
  unit: string | null;
  image_url: string | null;
  nutrition: ProductNutrition | null;
  /** Manufacturer storage instructions (Open Food Facts `conservation_conditions`). */
  storage_tip: string | null;
  notes: string | null;
};

export type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  image_front_small_url?: string;
  image_front_url?: string;
  image_url?: string;
  conservation_conditions?: string;
  conservation_conditions_en?: string;
  nutriments?: Record<string, unknown>;
};

/** Requested from Open Food Facts so responses stay small (a full product is often 50+ KB). */
export const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "brands",
  "quantity",
  "serving_size",
  "image_front_small_url",
  "image_front_url",
  "image_url",
  "conservation_conditions",
  "conservation_conditions_en",
  "nutriments",
].join(",");

const MAX_BRAND = 120;
const MAX_NAME = 120;
const MAX_STORAGE_TIP = 500;
const KJ_PER_KCAL = 4.184;

export function parseQuantity(raw: string | undefined): { quantity: number | null; unit: string | null } {
  if (!raw) return { quantity: null, unit: null };
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)$/);
  if (!m) return { quantity: null, unit: trimmed.slice(0, 12) || null };
  const value = Number(m[1].replace(",", "."));
  if (!Number.isFinite(value)) return { quantity: null, unit: m[2].toLowerCase() };
  return { quantity: value, unit: m[2].toLowerCase() };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

function cleanText(raw: string | undefined, max: number): string | null {
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > max ? `${collapsed.slice(0, max - 1).trimEnd()}…` : collapsed;
}

function kcalFor(n: Record<string, unknown>, suffix: "serving" | "100g"): number | null {
  const kcal = num(n[`energy-kcal_${suffix}`]);
  if (kcal != null) return kcal;
  // Some products only report kJ.
  const kj = num(n[`energy-kj_${suffix}`]) ?? num(n[`energy_${suffix}`]);
  return kj == null ? null : kj / KJ_PER_KCAL;
}

function nutritionFor(n: Record<string, unknown>, suffix: "serving" | "100g", servingSize: string | null): ProductNutrition | null {
  const nutrition: ProductNutrition = {
    basis: suffix,
    serving_size: suffix === "serving" ? servingSize : null,
    kcal: (() => {
      const k = kcalFor(n, suffix);
      return k == null ? null : Math.round(k);
    })(),
    protein_g: round1(num(n[`proteins_${suffix}`])),
    carbs_g: round1(num(n[`carbohydrates_${suffix}`])),
    fat_g: round1(num(n[`fat_${suffix}`])),
  };
  const any = [nutrition.kcal, nutrition.protein_g, nutrition.carbs_g, nutrition.fat_g].some((v) => v != null);
  return any ? nutrition : null;
}

/** Per serving when the label gives a serving size and per-serving values (what people eat), else per 100 g. */
export function normalizeNutrition(
  nutriments: Record<string, unknown> | undefined,
  servingSizeRaw: string | undefined
): ProductNutrition | null {
  if (!nutriments || typeof nutriments !== "object") return null;
  const servingSize = cleanText(servingSizeRaw, 40);
  if (servingSize) {
    const perServing = nutritionFor(nutriments, "serving", servingSize);
    if (perServing && perServing.kcal != null) return perServing;
  }
  return nutritionFor(nutriments, "100g", null);
}

function httpsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const url = raw.trim().replace(/^http:\/\//, "https://");
  return url.startsWith("https://") && url.length <= 500 ? url : null;
}

export function normalizeProduct(barcode: string, product: OpenFoodFactsProduct): ProductInfo {
  const { quantity, unit } = parseQuantity(product.quantity);
  return {
    barcode,
    name: cleanText(product.product_name_en || product.product_name, MAX_NAME),
    brand: cleanText(product.brands?.split(",")[0], MAX_BRAND),
    quantity,
    unit,
    image_url: httpsUrl(product.image_front_small_url || product.image_front_url || product.image_url),
    nutrition: normalizeNutrition(product.nutriments, product.serving_size),
    storage_tip: cleanText(product.conservation_conditions_en || product.conservation_conditions, MAX_STORAGE_TIP),
    notes: null,
  };
}

export function emptyProduct(barcode: string, notes: string | null): ProductInfo {
  return {
    barcode,
    name: null,
    brand: null,
    quantity: null,
    unit: null,
    image_url: null,
    nutrition: null,
    storage_tip: null,
    notes,
  };
}

/** Cache key and upstream query: lowercase, single-spaced, at most 60 characters. */
export function normalizeSearchQuery(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);
}
