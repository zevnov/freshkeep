import { fetchWithTimeout } from "./http.ts";

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  channelId?: string;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK = 100; // Expo's per-request limit

/** Sends messages in chunks; returns tokens Expo reports as no longer registered, for pruning. */
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<{ sent: number; deadTokens: string[] }> {
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN"); // only needed with Expo enhanced push security
  const deadTokens: string[] = [];
  let sent = 0;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const chunk = messages.slice(i, i + CHUNK);
    const res = await fetchWithTimeout(EXPO_PUSH_URL, 10000, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(chunk.map((m) => ({ sound: "default", channelId: "freshkeep", ...m }))),
    });
    if (!res.ok) throw new Error(`expo_push_${res.status}`);
    const body = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    (body.data ?? []).forEach((ticket, idx) => {
      if (ticket.status === "ok") sent += 1;
      else if (ticket.details?.error === "DeviceNotRegistered") deadTokens.push(chunk[idx].to);
    });
  }
  return { sent, deadTokens };
}
