import { adminClient, CORS_HEADERS, fetchWithTimeout, json, OFF_USER_AGENT, requireUser, serverEnv } from "../_shared/http.ts";
import {
  normalizeProduct,
  normalizeSearchQuery,
  OFF_FIELDS,
  type OpenFoodFactsProduct,
  type ProductInfo,
} from "../_shared/openFoodFacts.ts";

type SearchResponse = { query: string; products: ProductInfo[] };

const PAGE_SIZE = 20;
// Open Food Facts allows ~10 search requests a minute per IP, and every user shares this
// function's IP, so popular queries are served from a shared cache.
const CACHE_HOURS = 72;

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const env = serverEnv();
  if (!env) return json({ error: "server_not_configured" }, 500);
  const user = await requireUser(req, env.supabaseUrl);
  if (!user) return json({ error: "unauthorized" }, 401);
  const admin = adminClient(env);

  let query = "";
  try {
    const payload = (await req.json()) as { query?: unknown };
    query = normalizeSearchQuery(typeof payload.query === "string" ? payload.query : "");
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (query.length < 2) return json({ query, products: [] } satisfies SearchResponse);

  const { data: cached } = await admin
    .from("product_search_cache")
    .select("response")
    .eq("query", query)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cached?.response) return json(cached.response);

  const url =
    "https://world.openfoodfacts.org/cgi/search.pl?" +
    new URLSearchParams({
      search_terms: query,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: String(PAGE_SIZE),
      // Most-scanned first: the brands people actually buy rank above obscure listings.
      sort_by: "unique_scans_n",
      fields: OFF_FIELDS,
    }).toString();

  try {
    const res = await fetchWithTimeout(url, 8000, { headers: { "User-Agent": OFF_USER_AGENT } });
    if (!res.ok) return json({ error: "search_unavailable" }, 502);
    const body = (await res.json()) as { products?: OpenFoodFactsProduct[] };
    const seen = new Set<string>();
    const products: ProductInfo[] = [];
    for (const p of body.products ?? []) {
      const code = typeof p.code === "string" ? p.code.trim() : "";
      if (!/^\d{8,14}$/.test(code) || seen.has(code)) continue;
      const product = normalizeProduct(code, p);
      if (!product.name) continue;
      seen.add(code);
      products.push(product);
    }
    const response: SearchResponse = { query, products };
    await admin.from("product_search_cache").upsert({
      query,
      response,
      fetched_at: new Date().toISOString(),
      expires_at: hoursFromNow(CACHE_HOURS),
    });
    return json(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return json({ error: "search_timeout" }, 504);
    return json({ error: "search_unavailable" }, 502);
  }
});
