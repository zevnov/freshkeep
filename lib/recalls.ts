import { supabase } from "@/lib/supabase";
import * as Sentry from "@sentry/react-native";

export type RecallAlert = {
  id: string;
  item_id: string;
  recall_number: string;
  product_description: string;
  reason: string | null;
  recalling_firm: string | null;
  classification: string | null;
  report_date: string | null;
  url: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function parseRecallAlert(raw: unknown): RecallAlert | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const recall = (Array.isArray(r.product_recalls) ? r.product_recalls[0] : r.product_recalls) as
    | Record<string, unknown>
    | null
    | undefined;
  const id = str(r.id);
  const itemId = str(r.item_id);
  const recallNumber = str(r.recall_number);
  if (!id || !itemId || !recallNumber || !recall) return null;
  return {
    id,
    item_id: itemId,
    recall_number: recallNumber,
    product_description: str(recall.product_description) ?? "Recalled product",
    reason: str(recall.reason),
    recalling_firm: str(recall.recalling_firm),
    classification: str(recall.classification),
    report_date: str(recall.report_date),
    url: str(recall.url),
  };
}

/** Open (undismissed) recall alerts visible to the caller. Empty (and logged) if the query fails. */
export async function fetchRecallAlerts(): Promise<RecallAlert[]> {
  const { data, error } = await supabase
    .from("item_recall_alerts")
    .select(
      "id, item_id, recall_number, product_recalls(product_description, reason, recalling_firm, classification, report_date, url)"
    )
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    // Logged rather than shown: recall tracking is optional server setup, so a missing table
    // shouldn't put an error on the home screen, but a real failure must not be invisible.
    Sentry.captureMessage(`Recall alerts unavailable: ${error.message}`, "warning");
    return [];
  }
  return (data ?? []).map(parseRecallAlert).filter((a): a is RecallAlert => a != null);
}

export async function dismissRecallAlert(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("dismiss_recall_alert", { alert_id: id });
  return { error: error?.message ?? null };
}
