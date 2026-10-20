import { adminClient, CORS_HEADERS, fetchWithTimeout, json, OFF_USER_AGENT, requireUser, serverEnv } from "../_shared/http.ts";
import {
  emptyProduct,
  normalizeProduct,
  OFF_FIELDS,
  type OpenFoodFactsProduct,
  type ProductInfo,
} from "../_shared/openFoodFacts.ts";

type OpenFoodFactsResponse = {
  status: number;
  product?: OpenFoodFactsProduct;
};

type CacheRow = {
  barcode: string;
  response: ProductInfo;
  expires_at: string;
};

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/** Rows cached before nutrition/storage existed lack those keys; treat them as misses so they refetch. */
function isCurrentCacheShape(response: unknown): response is ProductInfo {
  return response != null && typeof response === "object" && "nutrition" in response && "storage_tip" in response;
}

function normalizeResult(barcode: string, body: OpenFoodFactsResponse): ProductInfo {
  if (body.status !== 1 || !body.product) {
    return emptyProduct(barcode, "No product found for this barcode.");
  }
  return normalizeProduct(barcode, body.product);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const env = serverEnv();
  if (!env) return json({ error: "server_not_configured" }, 500);
  const user = await requireUser(req, env.supabaseUrl);
  if (!user) return json({ error: "unauthorized" }, 401);
  const admin = adminClient(env);

  let barcode = "";
  try {
    const payload = (await req.json()) as { barcode?: unknown };
    barcode = typeof payload.barcode === "string" ? payload.barcode.trim() : "";
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!/^\d{8,14}$/.test(barcode)) {
    return json(emptyProduct(barcode, "Barcode format not supported."), 200);
  }

  const now = new Date().toISOString();
  const { data: cachedRow } = await admin
    .from("barcode_lookup_cache")
    .select("barcode, response, expires_at")
    .eq("barcode", barcode)
    .gt("expires_at", now)
    .maybeSingle();
  const cached = cachedRow as CacheRow | null;

  if (cached && isCurrentCacheShape(cached.response)) return json(cached.response, 200);

  try {
    const res = await fetchWithTimeout(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`,
      5000,
      { headers: { "User-Agent": OFF_USER_AGENT } }
    );
    if (!res.ok && res.status !== 404) {
      return json(emptyProduct(barcode, "Could not fetch product details."), 502);
    }

    const body = (await res.json()) as OpenFoodFactsResponse;
    const result = normalizeResult(barcode, body);
    const cacheHours = result.name ? 24 * 7 : 24;

    await admin.from("barcode_lookup_cache").upsert({
      barcode,
      response: result,
      source: "open_food_facts",
      fetched_at: new Date().toISOString(),
      expires_at: hoursFromNow(cacheHours),
    });

    return json(result, 200);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return json(emptyProduct(barcode, "Lookup timed out. Please try again."), 504);
    }
    return json(emptyProduct(barcode, "Lookup unavailable right now."), 502);
  }
});
