// Runs every 6 hours (pg_cron → pg_net, see supabase/patches/household_activity_and_recalls.sql).
// Pulls recent FDA food recalls, stores them, and matches their barcodes against active items.
// notification-dispatch then pushes the new alerts.
import { adminClient, CORS_HEADERS, fetchWithTimeout, isServiceRoleRequest, json, serverEnv } from "../_shared/http.ts";
import { fdaDateRange, normalizeFdaReport, type FdaEnforcementReport, type RecallRow } from "../_shared/recalls.ts";

const LOOKBACK_DAYS = 30; // FDA posts reports days to weeks after a recall starts
const PAGE = 1000; // openFDA's maximum page size

async function fetchRecentRecalls(): Promise<RecallRow[]> {
  const to = new Date();
  const from = new Date(to.getTime() - LOOKBACK_DAYS * 86_400_000);
  const apiKey = Deno.env.get("OPENFDA_API_KEY"); // optional; raises openFDA's daily quota
  const rows: RecallRow[] = [];
  for (let skip = 0; skip < 5 * PAGE; skip += PAGE) {
    const params = new URLSearchParams({ search: fdaDateRange(from, to), limit: String(PAGE), skip: String(skip) });
    if (apiKey) params.set("api_key", apiKey);
    const res = await fetchWithTimeout(`https://api.fda.gov/food/enforcement.json?${params}`, 15000);
    if (res.status === 404) break; // openFDA answers 404 when nothing matches
    if (!res.ok) throw new Error(`openfda_${res.status}`);
    const body = (await res.json()) as { results?: FdaEnforcementReport[]; meta?: { results?: { total?: number } } };
    for (const r of body.results ?? []) {
      const row = normalizeFdaReport(r);
      if (row) rows.push(row);
    }
    const total = body.meta?.results?.total ?? 0;
    if (skip + PAGE >= total) break;
  }
  return rows;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const env = serverEnv();
  if (!env) return json({ error: "server_not_configured" }, 500);
  if (!isServiceRoleRequest(req, env.serviceRoleKey)) return json({ error: "unauthorized" }, 401);
  const admin = adminClient(env);

  try {
    const recalls = await fetchRecentRecalls();
    const withCodes = recalls.filter((r) => r.gtins.length > 0);
    for (let i = 0; i < recalls.length; i += 500) {
      const { error } = await admin
        .from("product_recalls")
        .upsert(recalls.slice(i, i + 500).map((r) => ({ ...r, fetched_at: new Date().toISOString() })));
      if (error) throw new Error(error.message);
    }
    const { data: newAlerts, error: matchError } = await admin.rpc("match_item_recalls", {
      recall_numbers: withCodes.map((r) => r.recall_number),
      only_item: null,
    });
    if (matchError) throw new Error(matchError.message);
    return json({ recalls: recalls.length, with_barcodes: withCodes.length, new_alerts: newAlerts ?? 0 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "sync_failed" }, 502);
  }
});
