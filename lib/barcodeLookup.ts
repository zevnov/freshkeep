import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type BarcodeLookupResult = {
  barcode: string;
  name: string | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
};

export async function lookupBarcodeProduct(barcode: string): Promise<BarcodeLookupResult> {
  const code = barcode.trim();
  if (!/^\d{8,14}$/.test(code)) {
    return { barcode: code, name: null, quantity: null, unit: null, notes: "Barcode format not supported." };
  }

  try {
    const invokePromise = supabase.functions.invoke<BarcodeLookupResult>("barcode-lookup", {
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
            return { barcode: code, name: null, quantity: null, unit: null, notes: body.notes };
          }
        } catch {
          /* non-JSON error body — fall through to the generic message */
        }
      }
      return { barcode: code, name: null, quantity: null, unit: null, notes: "Could not fetch product details." };
    }
    if (!data || data.barcode !== code) {
      return { barcode: code, name: null, quantity: null, unit: null, notes: "Lookup unavailable right now." };
    }
    return data;
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") {
      return { barcode: code, name: null, quantity: null, unit: null, notes: "Lookup timed out. Please try again." };
    }
    return { barcode: code, name: null, quantity: null, unit: null, notes: "Lookup unavailable right now." };
  }
}
