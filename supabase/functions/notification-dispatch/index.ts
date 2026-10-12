// Runs every minute (pg_cron → pg_net, see supabase/patches/household_activity_and_recalls.sql).
// Sends unsent household activity ("Sam added Milk") and recall alerts as Expo pushes.
import { sendExpoPush, type ExpoPushMessage } from "../_shared/expoPush.ts";
import { adminClient, CORS_HEADERS, isServiceRoleRequest, json, serverEnv } from "../_shared/http.ts";
import {
  activityMessage,
  groupActivity,
  recallMessage,
  wantsPush,
  type ActivityRow,
} from "../_shared/notificationMessages.ts";

type Admin = ReturnType<typeof adminClient>;

// Let a burst (bulk scan, receipt import) finish so it becomes one notification.
const SETTLE_SECONDS = 20;
// Anything older than this is stale news (e.g. the cron was paused); mark it sent silently.
const STALE_MINUTES = 60;

type Recipient = { userId: string; tokens: string[] };

async function loadRecipients(
  admin: Admin,
  userIds: string[],
  pref: "notifyHouseholdActivity" | "notifyRecalls"
): Promise<Map<string, Recipient>> {
  const out = new Map<string, Recipient>();
  if (userIds.length === 0) return out;
  const [{ data: profiles }, { data: tokens }] = await Promise.all([
    admin.from("profiles").select("id, notification_settings").in("id", userIds),
    admin.from("push_tokens").select("token, user_id").in("user_id", userIds),
  ]);
  for (const p of (profiles ?? []) as { id: string; notification_settings: unknown }[]) {
    if (wantsPush(p.notification_settings, pref)) out.set(p.id, { userId: p.id, tokens: [] });
  }
  for (const t of (tokens ?? []) as { token: string; user_id: string }[]) {
    out.get(t.user_id)?.tokens.push(t.token);
  }
  return out;
}

async function householdMembers(admin: Admin, householdIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (householdIds.length === 0) return out;
  const { data } = await admin.from("household_members").select("household_id, user_id").in("household_id", householdIds);
  for (const m of (data ?? []) as { household_id: string; user_id: string }[]) {
    const list = out.get(m.household_id);
    if (list) list.push(m.user_id);
    else out.set(m.household_id, [m.user_id]);
  }
  return out;
}

async function dispatchActivity(admin: Admin): Promise<ExpoPushMessage[]> {
  const settled = new Date(Date.now() - SETTLE_SECONDS * 1000).toISOString();
  const stale = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("household_activity")
    .select("id, household_id, actor_id, action, item_name, created_at")
    .is("pushed_at", null)
    .lt("created_at", settled)
    .order("created_at")
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (ActivityRow & { created_at: string })[];
  if (rows.length === 0) return [];

  const fresh = rows.filter((r) => r.created_at >= stale);
  const groups = groupActivity(fresh);
  const householdIds = [...new Set(groups.map((g) => g.household_id))];
  const actorIds = [...new Set(groups.map((g) => g.actor_id))];

  const members = await householdMembers(admin, householdIds);
  const [{ data: households }, { data: actors }] = await Promise.all([
    admin.from("households").select("id, name").in("id", householdIds),
    admin.from("profiles").select("id, display_name").in("id", actorIds),
  ]);
  const householdName = new Map(((households ?? []) as { id: string; name: string }[]).map((h) => [h.id, h.name]));
  const actorName = new Map(
    ((actors ?? []) as { id: string; display_name: string | null }[]).map((a) => [a.id, a.display_name?.trim() || "Someone"])
  );
  const allMembers = [...new Set([...members.values()].flat())];
  const recipients = await loadRecipients(admin, allMembers, "notifyHouseholdActivity");

  const messages: ExpoPushMessage[] = [];
  for (const g of groups) {
    const body = activityMessage(actorName.get(g.actor_id) ?? "Someone", g.action, g.names);
    for (const userId of members.get(g.household_id) ?? []) {
      if (userId === g.actor_id) continue; // never notify people about their own changes
      for (const token of recipients.get(userId)?.tokens ?? []) {
        messages.push({ to: token, title: householdName.get(g.household_id) ?? "Freshkeep", body, data: { type: "activity" } });
      }
    }
  }

  // Mark everything fetched (stale rows included) so nothing is sent twice.
  await admin.from("household_activity").update({ pushed_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
  return messages;
}

type AlertRow = {
  id: string;
  item_id: string;
  household_id: string;
  items: { name: string; scope: string; owner_user_id: string | null; status: string } | null;
  product_recalls: { reason: string | null } | null;
};

async function dispatchRecalls(admin: Admin): Promise<ExpoPushMessage[]> {
  const { data, error } = await admin
    .from("item_recall_alerts")
    .select("id, item_id, household_id, items(name, scope, owner_user_id, status), product_recalls(reason)")
    .is("pushed_at", null)
    .is("dismissed_at", null)
    .order("created_at")
    .limit(200);
  if (error) throw new Error(error.message);
  const alerts = (data ?? []) as unknown as AlertRow[];
  if (alerts.length === 0) return [];

  const members = await householdMembers(admin, [...new Set(alerts.map((a) => a.household_id))]);
  const allMembers = [...new Set([...members.values()].flat())];
  const recipients = await loadRecipients(admin, allMembers, "notifyRecalls");

  const messages: ExpoPushMessage[] = [];
  for (const a of alerts) {
    if (!a.items || a.items.status !== "active") continue;
    // Private items alert only their owner; shared items alert the whole household.
    const audience = a.items.scope === "mine" ? (a.items.owner_user_id ? [a.items.owner_user_id] : []) : members.get(a.household_id) ?? [];
    const { title, body } = recallMessage(a.items.name, a.product_recalls?.reason ?? null);
    for (const userId of audience) {
      for (const token of recipients.get(userId)?.tokens ?? []) {
        messages.push({ to: token, title, body, data: { type: "recall", itemId: a.item_id } });
      }
    }
  }

  await admin.from("item_recall_alerts").update({ pushed_at: new Date().toISOString() }).in("id", alerts.map((a) => a.id));
  return messages;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const env = serverEnv();
  if (!env) return json({ error: "server_not_configured" }, 500);
  if (!isServiceRoleRequest(req, env.serviceRoleKey)) return json({ error: "unauthorized" }, 401);
  const admin = adminClient(env);

  try {
    const messages = [...(await dispatchActivity(admin)), ...(await dispatchRecalls(admin))];
    const { sent, deadTokens } = await sendExpoPush(messages);
    if (deadTokens.length > 0) await admin.from("push_tokens").delete().in("token", deadTokens);
    return json({ queued: messages.length, sent, pruned: deadTokens.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "dispatch_failed" }, 500);
  }
});
