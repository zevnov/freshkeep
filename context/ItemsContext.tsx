import { useAuth } from "@/context/AuthContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { normalizeItemName } from "@/lib/itemName";
import { cancelItemNotifications, rescheduleAllItems } from "@/lib/notifications";
import { applySyncResolutions, enqueue, mutationKey, peek, type QueuedMutation } from "@/lib/offlineQueue";
import { parseItemRow } from "@/lib/supabaseRows";
import { supabase } from "@/lib/supabase";
import { generateUUID } from "@/lib/uuid";
import type { CreateItemPayload, ItemRow, UpdateItemPatch } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Platform, type AppStateStatus } from "react-native";

type ItemsContextValue = {
  items: ItemRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createItem: (payload: CreateItemPayload) => Promise<{ error: Error | null; item?: ItemRow }>;
  updateItem: (
    id: string,
    patch: UpdateItemPatch,
    expectedScheduleVersion?: number
  ) => Promise<{ error: Error | null; item?: ItemRow }>;
};

const ItemsContext = createContext<ItemsContextValue | null>(null);

const ITEMS_CACHE_KEY_PREFIX = "freshkeep-items-cache:";

async function readItemsCache(householdId: string): Promise<ItemRow[] | null> {
  try {
    const raw = await AsyncStorage.getItem(ITEMS_CACHE_KEY_PREFIX + householdId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ItemRow[]) : null;
  } catch {
    return null;
  }
}

async function writeItemsCache(householdId: string, items: ItemRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ITEMS_CACHE_KEY_PREFIX + householdId, JSON.stringify(items));
  } catch {
    // best-effort cache; a failed write just means offline reads fall back to network next time
  }
}

function isNetworkErrorMessage(message: string): boolean {
  return /network request failed|failed to fetch|networkerror|typeerror/i.test(message);
}

function notifyConflict(message: string): void {
  if (Platform.OS === "web") {
    window.alert(message);
  } else {
    Alert.alert("Synced with changes from another device", message);
  }
}

export function ItemsProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, ensureProfile } = useAuth();
  const { isConnected } = useNetworkStatus();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Refs mirror the latest values for use inside callbacks/async work, so they never read stale closures.
  const itemsRef = useRef<ItemRow[]>([]);
  const userRef = useRef(user);
  const profileRef = useRef(profile);
  const isOnlineRef = useRef(true);
  const syncingRef = useRef(false);
  itemsRef.current = items;
  userRef.current = user;
  profileRef.current = profile;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const previousItemsRef = useRef<ItemRow[]>([]);

  const applyItems = useCallback((updater: (prev: ItemRow[]) => ItemRow[]) => {
    setItems((prev) => {
      const next = updater(prev);
      const hid = profileRef.current?.household_id;
      if (hid) void writeItemsCache(hid, next);
      return next;
    });
  }, []);

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

  const refresh = useCallback(async () => {
    if (!user?.id || !profile?.household_id) {
      setItems([]);
      setLoading(false);
      return;
    }
    const householdId = profile.household_id;
    setError(null);
    setLoading(true);

    if (!isOnlineRef.current) {
      const cached = await readItemsCache(householdId);
      setItems(cached ?? []);
      setLoading(false);
      return;
    }

    const { data, error: qerr } = await supabase
      .from("items")
      .select("*")
      .eq("household_id", householdId)
      .order("spoil_on", { ascending: true });
    if (qerr) {
      const cached = await readItemsCache(householdId);
      if (cached) {
        setItems(cached);
      } else {
        setError(qerr.message);
        setItems([]);
      }
    } else {
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
      }
      setItems(mapped);
      void writeItemsCache(householdId, mapped);
    }
    setLoading(false);
  }, [user?.id, profile]);

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
    async (payload: CreateItemPayload) => {
      const uid = user?.id;
      if (!uid) return { error: new Error("Not signed in") };
      let householdId = profile?.household_id;
      if (!householdId) {
        const p = await ensureProfile();
        householdId = p?.household_id;
      }
      if (!householdId) return { error: new Error("Missing profile") };

      const nowIso = new Date().toISOString();
      const tempId = generateUUID();
      const optimisticItem: ItemRow = {
        id: tempId,
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
        status: "active",
        schedule_version: 0,
        created_by: uid,
        created_at: nowIso,
        updated_at: nowIso,
      };
      applyItems((prev) => [...prev, optimisticItem]);

      const queueAndReturn = async () => {
        const { dropped } = await enqueue({ type: "create", tempId, payload, timestamp: nowIso });
        if (dropped) {
          applyItems((prev) => prev.filter((i) => i.id !== tempId));
          return { error: new Error("Too many pending changes. Connect to the internet to sync before adding more.") };
        }
        return { error: null, item: optimisticItem };
      };

      if (!isOnlineRef.current) return queueAndReturn();

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
        updated_at: nowIso,
      };
      try {
        const { data, error: ierr } = await supabase.from("items").insert(row).select("*").single();
        if (ierr) {
          if (isNetworkErrorMessage(ierr.message)) return queueAndReturn();
          applyItems((prev) => prev.filter((i) => i.id !== tempId));
          return { error: new Error(ierr.message) };
        }
        const pr = parseItemRow(data);
        if (!pr.ok) {
          applyItems((prev) => prev.filter((i) => i.id !== tempId));
          return { error: new Error(`Invalid item from server: ${pr.error}`) };
        }
        const item = pr.value;
        applyItems((prev) => prev.map((i) => (i.id === tempId ? item : i)));
        return { error: null, item };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (isNetworkErrorMessage(err.message)) return queueAndReturn();
        applyItems((prev) => prev.filter((i) => i.id !== tempId));
        return { error: err };
      }
    },
    [user?.id, profile?.household_id, ensureProfile, applyItems]
  );

  const updateItem = useCallback(
    async (id: string, patch: UpdateItemPatch, expectedScheduleVersion?: number) => {
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
      const nowIso = new Date().toISOString();
      const nextVersion = currentVersion + 1;
      const optimisticItem: ItemRow | undefined = existingItem
        ? {
            ...existingItem,
            ...patch,
            owner_user_id: patch.owner_user_id ?? existingItem.owner_user_id,
            schedule_version: nextVersion,
            updated_at: nowIso,
          }
        : undefined;
      if (optimisticItem) {
        const nextItem = optimisticItem;
        applyItems((prev) => prev.map((i) => (i.id === id ? nextItem : i)));
      }

      const queueAndReturn = async () => {
        const { dropped } = await enqueue({
          type: "update",
          itemId: id,
          patch,
          expectedScheduleVersion: currentVersion,
          timestamp: nowIso,
        });
        if (dropped) {
          return { error: new Error("Too many pending changes. Connect to the internet to sync before editing more.") };
        }
        return { error: null, item: optimisticItem };
      };

      if (!isOnlineRef.current) return queueAndReturn();

      const nextPatch = { ...patch, schedule_version: nextVersion, updated_at: nowIso };
      try {
        const { data, error: uerr } = await supabase
          .from("items")
          .update(nextPatch)
          .eq("id", id)
          .eq("schedule_version", currentVersion)
          .select("*")
          .maybeSingle();
        if (uerr) {
          if (isNetworkErrorMessage(uerr.message)) return queueAndReturn();
          if (existingItem) {
            const rollback = existingItem;
            applyItems((prev) => prev.map((i) => (i.id === id ? rollback : i)));
          }
          return { error: new Error(uerr.message) };
        }
        if (!data) {
          void refresh();
          return { error: new Error("This item was changed on another device. Refresh and try again.") };
        }
        const pr = parseItemRow(data);
        if (!pr.ok) return { error: new Error(`Invalid item from server: ${pr.error}`) };
        const item = pr.value;
        applyItems((prev) => prev.map((i) => (i.id === id ? item : i)));
        return { error: null, item };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (isNetworkErrorMessage(err.message)) return queueAndReturn();
        if (existingItem) {
          const rollback = existingItem;
          applyItems((prev) => prev.map((i) => (i.id === id ? rollback : i)));
        }
        return { error: err };
      }
    },
    [profile, ensureProfile, refresh, applyItems]
  );

  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const uid = userRef.current?.id;
    const householdId = profileRef.current?.household_id;
    if (!uid || !householdId) return;

    syncingRef.current = true;
    try {
      const batch = await peek();
      if (batch.length === 0) return;

      // Creates must land before updates: an update queued after a create may target that create's tempId.
      const creates = batch.filter((m): m is Extract<QueuedMutation, { type: "create" }> => m.type === "create");
      const updates = batch.filter((m): m is Extract<QueuedMutation, { type: "update" }> => m.type === "update");

      const idMap = new Map<string, string>();
      const resolutions = new Map<string, QueuedMutation | null>();
      let hadConflict = false;

      for (const mutation of creates) {
        const key = mutationKey(mutation);
        const nowIso = new Date().toISOString();
        const row = {
          household_id: householdId,
          owner_user_id: uid,
          scope: mutation.payload.scope,
          name: normalizeItemName(mutation.payload.name),
          storage: mutation.payload.storage,
          spoil_on: mutation.payload.spoil_on,
          quantity: mutation.payload.quantity,
          unit: mutation.payload.unit,
          notes: mutation.payload.notes,
          remind_me: mutation.payload.remind_me,
          remind_days_before: mutation.payload.remind_days_before,
          status: "active" as const,
          schedule_version: 0,
          created_by: uid,
          updated_at: nowIso,
        };
        try {
          const { data, error: ierr } = await supabase.from("items").insert(row).select("*").single();
          if (ierr) continue; // still offline-ish or server rejected; retry next sync
          const pr = parseItemRow(data);
          if (!pr.ok) continue;
          idMap.set(mutation.tempId, pr.value.id);
          resolutions.set(key, null);
          const resolved = pr.value;
          applyItems((prev) => prev.map((i) => (i.id === mutation.tempId ? resolved : i)));
        } catch {
          // leave unresolved; retried on next online transition
        }
      }

      for (const mutation of updates) {
        const key = mutationKey(mutation);
        const remappedId = idMap.get(mutation.itemId);
        const pendingCreate = remappedId == null && creates.some((c) => c.tempId === mutation.itemId);
        if (pendingCreate) continue; // its create failed this round too; retry both next sync

        const resolvedId = remappedId ?? mutation.itemId;
        const nowIso = new Date().toISOString();
        const nextPatch = {
          ...mutation.patch,
          schedule_version: mutation.expectedScheduleVersion + 1,
          updated_at: nowIso,
        };
        try {
          const { data, error: uerr } = await supabase
            .from("items")
            .update(nextPatch)
            .eq("id", resolvedId)
            .eq("schedule_version", mutation.expectedScheduleVersion)
            .select("*")
            .maybeSingle();
          if (uerr) {
            if (resolvedId !== mutation.itemId) resolutions.set(key, { ...mutation, itemId: resolvedId });
            continue;
          }
          if (!data) {
            hadConflict = true;
            resolutions.set(key, null); // server wins; drop the stale patch
            continue;
          }
          const pr = parseItemRow(data);
          if (!pr.ok) {
            if (resolvedId !== mutation.itemId) resolutions.set(key, { ...mutation, itemId: resolvedId });
            continue;
          }
          resolutions.set(key, null);
          const resolved = pr.value;
          applyItems((prev) => prev.map((i) => (i.id === resolvedId ? resolved : i)));
        } catch {
          if (resolvedId !== mutation.itemId) resolutions.set(key, { ...mutation, itemId: resolvedId });
        }
      }

      if (resolutions.size > 0) await applySyncResolutions(resolutions);
      if (hadConflict) {
        notifyConflict("Someone else updated an item while you were offline. We've refreshed it with their latest changes.");
        void refresh();
      }
    } finally {
      syncingRef.current = false;
    }
  }, [applyItems, refresh]);

  useEffect(() => {
    isOnlineRef.current = isConnected;
    if (isConnected) void syncQueue();
  }, [isConnected, syncQueue]);

  const value = useMemo(
    () => ({ items, loading, error, refresh, createItem, updateItem }),
    [items, loading, error, refresh, createItem, updateItem]
  );

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems(): ItemsContextValue {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error("useItems must be used within ItemsProvider");
  return ctx;
}
