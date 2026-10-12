import { createClient } from "npm:@supabase/supabase-js@2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

export async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Open Food Facts asks API clients to identify themselves. */
export const OFF_USER_AGENT = "Freshkeep/1.0 (household food tracker)";

export function serverEnv(): { supabaseUrl: string; serviceRoleKey: string } | null {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

export function adminClient(env: { supabaseUrl: string; serviceRoleKey: string }) {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Resolves the signed-in caller from the request's bearer token, or null if it is missing or invalid. */
export async function requireUser(req: Request, supabaseUrl: string): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const callerClient = createClient(supabaseUrl, authHeader.slice(7), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error,
  } = await callerClient.auth.getUser();
  if (error || !user) return null;
  return { id: user.id };
}

/** For functions only the database or a scheduler calls: the bearer must be the service-role key. */
export function isServiceRoleRequest(req: Request, serviceRoleKey: string): boolean {
  return req.headers.get("Authorization") === `Bearer ${serviceRoleKey}`;
}
