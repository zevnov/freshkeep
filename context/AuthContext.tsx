import type { NotificationPrefs, ItemScope, StoragePlace } from "@/types";
import { DEFAULT_NOTIFICATION_PREFS } from "@/types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

WebBrowser.maybeCompleteAuthSession();

export type Profile = {
  id: string;
  display_name: string | null;
  household_id: string;
  default_bucket: ItemScope;
  default_storage: StoragePlace;
  notification_prefs: NotificationPrefs;
};

type AuthContextValue = {
  configured: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{ error: Error | null; needsEmailConfirmation: boolean }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Loads profile from Supabase and updates state; returns it for immediate use (e.g. before insert). */
  ensureProfile: () => Promise<Profile | null>;
  updateNotificationPrefs: (patch: Partial<NotificationPrefs>) => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mapAuthNetworkError(err: Error): Error {
  const m = err.message;
  if (/network request failed|failed to fetch|networkerror|typeerror/i.test(m)) {
    return new Error(
      "Cannot reach Supabase. Check EXPO_PUBLIC_SUPABASE_URL and key in .env (no quotes or trailing spaces), then run npx expo start -c. On a phone, use your cloud https://…supabase.co URL or your PC’s LAN IP for local Supabase—not localhost."
    );
  }
  return err;
}

async function authResult(fn: () => Promise<{ error: { message: string } | null }>): Promise<{ error: Error | null }> {
  try {
    const { error } = await fn();
    if (error) return { error: mapAuthNetworkError(new Error(error.message)) };
    return { error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { error: mapAuthNetworkError(err) };
  }
}

function readOAuthParam(callbackUrl: string, name: string): string | null {
  const parsed = new URL(callbackUrl);
  const fromQuery = parsed.searchParams.get(name);
  if (fromQuery) return fromQuery;
  const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
  return new URLSearchParams(hash).get(name);
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : Number.parseInt(String(n), 10);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, x));
}

function mergePrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_NOTIFICATION_PREFS };
  const o = raw as Record<string, unknown>;
  const base = { ...DEFAULT_NOTIFICATION_PREFS, ...(raw as Partial<NotificationPrefs>) };
  return {
    ...base,
    notificationStyle: o.notificationStyle === "digest" ? "digest" : "individual",
    digestHour: clampInt(o.digestHour, 0, 23, DEFAULT_NOTIFICATION_PREFS.digestHour),
    digestMinute: clampInt(o.digestMinute, 0, 59, DEFAULT_NOTIFICATION_PREFS.digestMinute),
  };
}

function mapProfile(row: {
  id: string;
  display_name: string | null;
  household_id: string;
  default_bucket: string;
  default_storage: string;
  notification_settings: unknown;
}): Profile {
  return {
    id: row.id,
    display_name: row.display_name,
    household_id: row.household_id,
    default_bucket: row.default_bucket === "mine" ? "mine" : "ours",
    default_storage: row.default_storage as StoragePlace,
    notification_prefs: mergePrefs(row.notification_settings),
  };
}

const PROFILE_SELECT =
  "id, display_name, household_id, default_bucket, default_storage, notification_settings" as const;

/** Fetches profile with retries (helps flaky mobile networks / cold auth). */
async function fetchProfileForUser(userId: string): Promise<Profile | null> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();
    if (!error && data) return mapProfile(data);
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured;
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const p = await fetchProfileForUser(userId);
    if (mountedRef.current) setProfile(p);
  }, []);

  const ensureProfile = useCallback(async (): Promise<Profile | null> => {
    const uid = session?.user?.id;
    if (!uid) return null;
    const p = await fetchProfileForUser(uid);
    if (p) setProfile(p);
    return p;
  }, [session?.user?.id]);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session ?? null);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) void loadProfile(next.user.id);
      else setProfile(null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [configured, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    return authResult(() => supabase.auth.signInWithPassword({ email: email.trim(), password }));
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (error) return { error: mapAuthNetworkError(new Error(error.message)), needsEmailConfirmation: false };
      return { error: null, needsEmailConfirmation: !data.session };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return { error: mapAuthNetworkError(err), needsEmailConfirmation: false };
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const redirectTo = Linking.createURL("auth/callback");
      if (__DEV__) console.log("[OAuth] Add this exact URL to Supabase Redirect URLs:", redirectTo);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) return { error: mapAuthNetworkError(new Error(error.message)) };
      if (!data.url) return { error: new Error("Supabase did not return a Google sign-in URL.") };

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") return { error: null };

      const errorDescription = readOAuthParam(result.url, "error_description");
      if (errorDescription) return { error: new Error(errorDescription) };

      const code = readOAuthParam(result.url, "code");
      if (!code) return { error: new Error("Google sign-in did not return an authorization code.") };

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) return { error: mapAuthNetworkError(new Error(exchangeError.message)) };

      return { error: null };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return { error: mapAuthNetworkError(err) };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [loadProfile, session?.user]);

  const updateNotificationPrefs = useCallback(
    async (patch: Partial<NotificationPrefs>) => {
      if (!session?.user || !profile) return { error: new Error("Not signed in") };
      const next = { ...profile.notification_prefs, ...patch };
      const { error } = await supabase
        .from("profiles")
        .update({ notification_settings: next, updated_at: new Date().toISOString() })
        .eq("id", session.user.id);
      if (error) return { error: new Error(error.message) };
      setProfile({ ...profile, notification_prefs: next });
      return { error: null };
    },
    [profile, session?.user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      refreshProfile,
      ensureProfile,
      updateNotificationPrefs,
    }),
    [
      configured,
      session,
      profile,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      refreshProfile,
      ensureProfile,
      updateNotificationPrefs,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
