import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { parseNutrition } from "@/lib/supabaseRows";
import type { ItemNutrition } from "@/types";

export type BarcodeLookupResult = {
  barcode: string;
  name: string | null;
  brand: string | null;
  quantity: number | null;
  unit: string | null;
  image_url: string | null;
  nutrition: ItemNutrition | null;
  /** Manufacturer storage instructions, when the product lists them. */
  storage_tip: string | null;
  notes: string | null;
};

function emptyResult(barcode: string, notes: string | null): BarcodeLookupResult {
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

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Validates an edge-function product payload; shared with quick-add search results. */
export function parseProductResult(raw: unknown): BarcodeLookupResult | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const barcode = str(o.barcode);
  if (!barcode) return null;
  const quantity = typeof o.quantity === "number" && Number.isFinite(o.quantity) ? o.quantity : null;
  const imageUrl = str(o.image_url);
  return {
    barcode,
    name: str(o.name),
    brand: str(o.brand),
    quantity,
    unit: str(o.unit),
    image_url: imageUrl && imageUrl.startsWith("https://") ? imageUrl : null,
    nutrition: parseNutrition(o.nutrition),
    storage_tip: str(o.storage_tip),
    notes: str(o.notes),
  };
}

export async function lookupBarcodeProduct(barcode: string): Promise<BarcodeLookupResult> {
  const code = barcode.trim();
  if (!/^\d{8,14}$/.test(code)) {
    return emptyResult(code, "Barcode format not supported.");
  }

  try {
    const invokePromise = supabase.functions.invoke<unknown>("barcode-lookup", {
      body: { barcode: code },
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), 7000);
    });
    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
    if (error) {
      // Non-2xx from the edge function: surface its specific message (timeout/unavailable) when present.
      if (error instanceof FunctionsHttpError) {
        try {
          const body = (await error.context.json()) as { notes?: unknown } | null;
          if (body && typeof body.notes === "string" && body.notes) {
            return emptyResult(code, body.notes);
          }
        } catch {
          /* non-JSON error body — fall through to the generic message */
        }
      }
      return emptyResult(code, "Could not fetch product details.");
    }
    const parsed = parseProductResult(data);
    if (!parsed || parsed.barcode !== code) {
      return emptyResult(code, "Lookup unavailable right now.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") {
      return emptyResult(code, "Lookup timed out. Please try again.");
    }
    return emptyResult(code, "Lookup unavailable right now.");
  }
}
