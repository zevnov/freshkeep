import { useAuth } from "@/context/AuthContext";
import { normalizeItemName } from "@/lib/itemName";
import { cancelItemNotifications, rescheduleAllItems } from "@/lib/notifications";
import { parseItemRow } from "@/lib/supabaseRows";
import { supabase } from "@/lib/supabase";
import type { ItemRow, ItemScope, ItemStatus, StoragePlace } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

type ItemsContextValue = {
  items: ItemRow[];
  loading: boolean;
  isOffline: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createItem: (payload: {
    scope: ItemScope;
    name: string;
    storage: StoragePlace;
    spoil_on: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
    remind_me: boolean;
    remind_days_before: number;
  }) => Promise<{ error: Error | null; item?: ItemRow }>;
  updateItem: (
    id: string,
    patch: Partial<{
      scope: ItemScope;
      name: string;
      storage: StoragePlace;
      spoil_on: string;
      quantity: number | null;
      unit: string | null;
      notes: string | null;
      remind_me: boolean;
      remind_days_before: number;
      status: ItemStatus;
      owner_user_id: string | null;
    }>
    ,
    expectedScheduleVersion?: number
  ) => Promise<{ error: Error | null; item?: ItemRow }>;
};

const ItemsContext = createContext<ItemsContextValue | null>(null);

const ITEMS_CACHE_KEY_PREFIX = "freshkeep-items-cache";

type CachedItemsPayload = {
  items: ItemRow[];
  savedAt: string;
};

function itemCacheKey(householdId: string): string {
  return `${ITEMS_CACHE_KEY_PREFIX}:${householdId}`;
}

function isItemRowArray(value: unknown): value is ItemRow[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Partial<ItemRow>;
      return typeof row.id === "string" && typeof row.name === "string" && typeof row.household_id === "string";
    })
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function isNetworkError(error: unknown): boolean {
  return /network request failed|failed to fetch|networkerror|network error|offline|timeout/i.test(
    getErrorMessage(error)
  );
}

async function writeCachedItems(householdId: string, items: ItemRow[]): Promise<void> {
  const payload: CachedItemsPayload = {
    items,
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(itemCacheKey(householdId), JSON.stringify(payload));
}

async function readCachedItems(householdId: string): Promise<ItemRow[]> {
  const raw = await AsyncStorage.getItem(itemCacheKey(householdId));
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") return [];
  const payload = parsed as Partial<CachedItemsPayload>;
  return isItemRowArray(payload.items) ? payload.items : [];
}

export function ItemsProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, ensureProfile } = useAuth();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Latest snapshot for AppState foreground reschedule only (wall clock may change without React state updates).
  const itemsRef = useRef<ItemRow[]>([]);
  const profileRef = useRef(profile);
  itemsRef.current = items;
  profileRef.current = profile;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const previousItemsRef = useRef<ItemRow[]>([]);

  useEffect(() => {
    if (!profile) return;
    const previousItems = previousItemsRef.current;
    previousItemsRef.current = items;

    (async () => {
      const currentIds = new Set(items.map((item) => item.id));
      for (const oldItem of previousItems) {
        if (!currentIds.has(oldItem.id)) {
          await cancelItemNotifications(oldItem.id);
        }
      }
      await rescheduleAllItems(items, profile.notification_prefs);
    })().catch((err) => Sentry.captureException(err));
  }, [items, profile]);

  const syncCache = useCallback(async (householdId: string, nextItems: ItemRow[]) => {
    try {
      await writeCachedItems(householdId, nextItems);
    } catch (cacheError) {
      Sentry.captureException(cacheError);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!user?.id || !profile?.household_id) {
      setItems([]);
      setIsOffline(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: qerr } = await supabase
        .from("items")
        .select("*")
        .eq("household_id", profile.household_id)
        .order("spoil_on", { ascending: true });
      if (qerr) throw qerr;
      const rows = data ?? [];
      const mapped: ItemRow[] = [];
      let firstBad: string | null = null;
      for (const r of rows) {
        const pr = parseItemRow(r);
        if (pr.ok) mapped.push(pr.value);
        else if (!firstBad) firstBad = pr.error;
      }
      if (firstBad) {
        setError(
          rows.length === 0 || mapped.length === 0
            ? `Invalid item data: ${firstBad}`
            : `Some items could not be loaded (${firstBad}).`
        );
      } else {
        setError(null);
      }
      setItems(mapped);
      setIsOffline(false);
      void syncCache(profile.household_id, mapped);
    } catch (refreshError) {
      if (isNetworkError(refreshError)) {
        const cachedItems = await readCachedItems(profile.household_id);
        setItems(cachedItems);
        setIsOffline(true);
        setError(null);
      } else {
        setError(getErrorMessage(refreshError));
        setIsOffline(false);
        setItems([]);
      }
    }
    setLoading(false);
  }, [user?.id, profile, syncCache]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      if ((prev === "background" || prev === "inactive") && next === "active") {
        const p = profileRef.current;
        if (p) void rescheduleAllItems(itemsRef.current, p.notification_prefs);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  const createItem = useCallback(
    async (payload: {
      scope: ItemScope;
      name: string;
      storage: StoragePlace;
      spoil_on: string;
      quantity: number | null;
      unit: string | null;
      notes: string | null;
      remind_me: boolean;
      remind_days_before: number;
    }) => {
      const uid = user?.id;
      if (!uid) return { error: new Error("Not signed in") };
      let householdId = profile?.household_id;
      if (!householdId) {
        const p = await ensureProfile();
        householdId = p?.household_id;
      }
      if (!householdId) return { error: new Error("Missing profile") };
      const row = {
        household_id: householdId,
        owner_user_id: uid,
        scope: payload.scope,
        name: normalizeItemName(payload.name),
        storage: payload.storage,
        spoil_on: payload.spoil_on,
        quantity: payload.quantity,
        unit: payload.unit,
        notes: payload.notes,
        remind_me: payload.remind_me,
        remind_days_before: payload.remind_days_before,
        status: "active" as const,
        schedule_version: 0,
        created_by: uid,
        updated_at: new Date().toISOString(),
      };
      const { data, error: ierr } = await supabase.from("items").insert(row).select("*").single();
      if (ierr) return { error: new Error(ierr.message) };
      const pr = parseItemRow(data);
      if (!pr.ok) return { error: new Error(`Invalid item from server: ${pr.error}`) };
      const item = pr.value;
      setItems((prev) => {
        const next = [...prev, item];
        void syncCache(householdId, next);
        return next;
      });
      return { error: null, item };
    },
    [user?.id, profile?.household_id, ensureProfile, syncCache]
  );

  const updateItem = useCallback(
    async (
      id: string,
      patch: Partial<{
        scope: ItemScope;
        name: string;
        storage: StoragePlace;
        spoil_on: string;
        quantity: number | null;
        unit: string | null;
        notes: string | null;
        remind_me: boolean;
        remind_days_before: number;
        status: ItemStatus;
      }>,
      expectedScheduleVersion?: number
    ) => {
      let p = profile;
      if (!p?.household_id) {
        p = await ensureProfile();
      }
      if (!p?.household_id) return { error: new Error("Missing profile") };
      const existingItem = itemsRef.current.find((item) => item.id === id);
      const currentVersion = expectedScheduleVersion ?? existingItem?.schedule_version;
      if (currentVersion == null) {
        return { error: new Error("Could not determine the current version of this item. Refresh and try again.") };
      }
      const nextPatch = {
        ...patch,
        schedule_version: currentVersion + 1,
        updated_at: new Date().toISOString(),
      };
      const { data, error: uerr } = await supabase
        .from("items")
        .update(nextPatch)
        .eq("id", id)
        .eq("schedule_version", currentVersion)
        .select("*")
        .maybeSingle();
      if (uerr) return { error: new Error(uerr.message) };
      if (!data) {
        void refresh();
        return { error: new Error("This item was changed on another device. Refresh and try again.") };
      }
      const pr = parseItemRow(data);
      if (!pr.ok) return { error: new Error(`Invalid item from server: ${pr.error}`) };
      const item = pr.value;
      setItems((prev) => {
        const next = prev.map((i) => (i.id === id ? item : i));
        void syncCache(p.household_id, next);
        return next;
      });
      return { error: null, item };
    },
    [profile, ensureProfile, refresh, syncCache]
  );

  const value = useMemo(
    () => ({ items, loading, isOffline, error, refresh, createItem, updateItem }),
    [items, loading, isOffline, error, refresh, createItem, updateItem]
  );

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems(): ItemsContextValue {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error("useItems must be used within ItemsProvider");
  return ctx;
}
