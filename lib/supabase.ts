import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const extra = Constants.expoConfig?.extra as { supabaseUrl?: string; supabaseAnonKey?: string } | undefined;

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

/** Prefer env (Metro inlines EXPO_PUBLIC_*); fall back to app.config.js `extra` from dotenv. */
const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || extra?.supabaseUrl || "").trim();
const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra?.supabaseAnonKey || "").trim();

function validateSupabaseConfig(rawUrl: string, rawAnonKey: string): string | null {
  if (!rawUrl) return "Missing EXPO_PUBLIC_SUPABASE_URL.";
  if (!rawAnonKey) return "Missing EXPO_PUBLIC_SUPABASE_ANON_KEY.";

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "EXPO_PUBLIC_SUPABASE_URL is not a valid URL.";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "EXPO_PUBLIC_SUPABASE_URL must start with http:// or https://.";
  }
  if (!parsed.hostname) {
    return "EXPO_PUBLIC_SUPABASE_URL is missing a hostname.";
  }
  if (/\s/.test(rawUrl)) {
    return "EXPO_PUBLIC_SUPABASE_URL cannot contain spaces.";
  }
  if (/\s/.test(rawAnonKey)) {
    return "EXPO_PUBLIC_SUPABASE_ANON_KEY cannot contain spaces.";
  }
  return null;
}

export const supabaseConfigError = validateSupabaseConfig(url, anonKey);
export const isSupabaseConfigured = !supabaseConfigError;
const clientUrl = isSupabaseConfigured ? url : "https://placeholder.supabase.co";
const clientAnonKey = isSupabaseConfigured ? anonKey : "placeholder";

export const supabase = createClient(clientUrl, clientAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
