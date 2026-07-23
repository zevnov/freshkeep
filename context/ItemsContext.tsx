import { useAuth } from "@/context/AuthContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { normalizeItemName } from "@/lib/itemName";
import { isNetworkErrorMessage } from "@/lib/networkError";
import { cancelItemNotifications, rescheduleAllItems } from "@/lib/notifications";
import {
  applySyncResolutions,
  enqueue,
  mutationKey,
  peek,
  type EnqueueResult,
  type QueuedMutation,
} from "@/lib/offlineQueue";
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

export function notifyUser(title: string, message: string): void {
  if (Platform.OS === "web") {
    window.alert(message);
  } else {
    Alert.alert(title, message);
  }
}

function enqueueFailureError(result: Extract<EnqueueResult, { ok: false }>, verb: string): Error {
  return result.reason === "full"
    ? new Error(`Too many pending changes. Connect to the internet to sync before ${verb} more.`)
    : new Error("Couldn't save this change on your device. Free up some storage and try again.");
}

/** Shared by the live create path and queued-mutation sync so the insert shape can't drift between them. */
function buildInsertRow(householdId: string, uid: string, payload: CreateItemPayload, nowIso: string) {
  return {
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

    // The query await itself can throw (auth lock contention, SecureStore failures); route
    // that through the same handling as a returned error so setLoading(false) still runs.
    let data: unknown[] | null = null;
    let qerr: { message: string } | null = null;
    try {
      const res = await supabase
        .from("items")
        .select("*")
        .eq("household_id", householdId)
        .order("spoil_on", { ascending: true });
      data = res.data;
      qerr = res.error;
    } catch (e) {
      qerr = e instanceof Error ? e : new Error(String(e));
    }
    if (qerr) {
      // Only a genuine connectivity failure falls back to cache; a server-side error
      // (RLS, auth, bad request) must surface, not be masked by stale data.
      const cached = isNetworkErrorMessage(qerr.message) ? await readItemsCache(householdId) : null;
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
      // Server rows can't include optimistic items whose creates are still queued; keep
      // those (appended, as when they were added) or every refresh wipes them until sync.
      const pendingCreates = (await peek()).filter(
        (m): m is Extract<QueuedMutation, { type: "create" }> => m.type === "create"
      );
      const pendingTempIds = new Set(pendingCreates.map((m) => m.tempId));
      const merged = [...mapped, ...itemsRef.current.filter((i) => pendingTempIds.has(i.id))];
      setItems(merged);
      void writeItemsCache(householdId, merged);
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
        const result = await enqueue({ type: "create", tempId, payload, timestamp: nowIso });
        if (!result.ok) {
          applyItems((prev) => prev.filter((i) => i.id !== tempId));
          return { error: enqueueFailureError(result, "adding") };
        }
        return { error: null, item: optimisticItem };
      };

      if (!isOnlineRef.current) return queueAndReturn();

      const row = buildInsertRow(householdId, uid, payload, nowIso);
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
        ? { ...existingItem, ...patch, schedule_version: nextVersion, updated_at: nowIso }
        : undefined;
      if (optimisticItem) {
        const nextItem = optimisticItem;
        applyItems((prev) => prev.map((i) => (i.id === id ? nextItem : i)));
      }
      const rollbackOptimistic = () => {
        if (existingItem) {
          applyItems((prev) => prev.map((i) => (i.id === id ? existingItem : i)));
        }
      };

      const queueAndReturn = async () => {
        const result = await enqueue({
          type: "update",
          itemId: id,
          patch,
          expectedScheduleVersion: currentVersion,
          timestamp: nowIso,
        });
        if (!result.ok) {
          rollbackOptimistic();
          return { error: enqueueFailureError(result, "editing") };
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
          rollbackOptimistic();
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
        rollbackOptimistic();
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

      // Persist each mutation's outcome immediately so a kill mid-sync can't replay
      // already-committed creates as duplicates. Storage failures here are non-fatal:
      // worst case the mutation replays and the server-side version check rejects it.
      const persistResolutions = async (stepResolutions: Map<string, QueuedMutation | null>) => {
        try {
          await applySyncResolutions(stepResolutions);
        } catch (err) {
          Sentry.captureException(err);
        }
      };

      // Batched view updates: id -> replacement row (or null to remove). Applied once at
      // the end so a 100-mutation drain does one state/cache write, not one per mutation.
      const stateChanges = new Map<string, ItemRow | null>();
      const droppedTempIds = new Set<string>();
      const pendingTempIds = new Set<string>();
      // Real id -> tempId for creates resolved in this batch: an update remapped to the real
      // id must also claim the optimistic tempId slot (state still keys the item by tempId),
      // and a resolved create missing from state entirely gets re-inserted at the end.
      const tempIdByResolvedId = new Map<string, string>();
      const failedNames: string[] = [];
      let hadConflict = false;
      let needsRefresh = false;

      for (const mutation of creates) {
        const key = mutationKey(mutation);
        const nowIso = new Date().toISOString();
        const row = buildInsertRow(householdId, uid, mutation.payload, nowIso);

        const dropCreateAndDependents = async (alsoDropLocalItem: boolean) => {
          const stepResolutions = new Map<string, QueuedMutation | null>([[key, null]]);
          for (const u of updates) {
            if (u.itemId === mutation.tempId) stepResolutions.set(mutationKey(u), null);
          }
          droppedTempIds.add(mutation.tempId);
          if (alsoDropLocalItem) stateChanges.set(mutation.tempId, null);
          await persistResolutions(stepResolutions);
        };

        try {
          const { data, error: ierr } = await supabase.from("items").insert(row).select("*").single();
          if (ierr) {
            if (isNetworkErrorMessage(ierr.message)) {
              pendingTempIds.add(mutation.tempId); // transient; retry whole chain next sync
            } else {
              // Server rejected the payload outright — retrying is pointless. Drop it and tell the user.
              failedNames.push(mutation.payload.name);
              await dropCreateAndDependents(true);
            }
            continue;
          }
          const pr = parseItemRow(data);
          if (!pr.ok) {
            // The row WAS inserted; leaving the mutation queued would duplicate it next sync.
            needsRefresh = true;
            await dropCreateAndDependents(false);
            continue;
          }
          const resolved = pr.value;
          stateChanges.set(mutation.tempId, resolved);
          tempIdByResolvedId.set(resolved.id, mutation.tempId);
          // Resolve the create and remap dependent updates to the real row id in the same
          // persisted step, so a crash after this point replays nothing and orphans nothing.
          const stepResolutions = new Map<string, QueuedMutation | null>([[key, null]]);
          for (let i = 0; i < updates.length; i++) {
            if (updates[i].itemId === mutation.tempId) {
              const rewritten = { ...updates[i], itemId: resolved.id };
              stepResolutions.set(mutationKey(updates[i]), rewritten);
              updates[i] = rewritten;
            }
          }
          await persistResolutions(stepResolutions);
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          if (isNetworkErrorMessage(err.message)) {
            pendingTempIds.add(mutation.tempId);
          } else {
            Sentry.captureException(err);
            failedNames.push(mutation.payload.name);
            await dropCreateAndDependents(true);
          }
        }
      }

      for (const mutation of updates) {
        if (droppedTempIds.has(mutation.itemId)) continue; // dropped along with its failed create
        if (pendingTempIds.has(mutation.itemId)) continue; // its create retries next sync; keep order

        const key = mutationKey(mutation);
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
            .eq("id", mutation.itemId)
            .eq("schedule_version", mutation.expectedScheduleVersion)
            .select("*")
            .maybeSingle();
          if (uerr) {
            if (!isNetworkErrorMessage(uerr.message)) {
              // Permanent server rejection: drop it and refresh to restore server truth.
              failedNames.push(mutation.patch.name ?? "an item edit");
              needsRefresh = true;
              await persistResolutions(new Map([[key, null]]));
            }
            continue; // transient failures stay queued for the next sync
          }
          if (!data) {
            hadConflict = true;
            needsRefresh = true;
            await persistResolutions(new Map([[key, null]])); // server wins; drop the stale patch
            continue;
          }
          const pr = parseItemRow(data);
          if (!pr.ok) {
            // Update landed but the response didn't parse; drop the mutation and re-fetch.
            needsRefresh = true;
            await persistResolutions(new Map([[key, null]]));
            continue;
          }
          stateChanges.set(mutation.itemId, pr.value);
          // If this update targeted a create resolved above, state still holds the item under
          // its tempId — the edited row must win that slot too, not just the real id.
          const createdTempId = tempIdByResolvedId.get(mutation.itemId);
          if (createdTempId) stateChanges.set(createdTempId, pr.value);
          await persistResolutions(new Map([[key, null]]));
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          if (!isNetworkErrorMessage(err.message)) {
            Sentry.captureException(err);
            failedNames.push(mutation.patch.name ?? "an item edit");
            needsRefresh = true;
            await persistResolutions(new Map([[key, null]]));
          }
        }
      }

      if (stateChanges.size > 0) {
        applyItems((prev) => {
          // A create and its follow-up update resolve to the same row id, and a mid-sync
          // refresh may already have delivered that id: emit each resolved row once.
          const seenIds = new Set<string>();
          const next = prev.flatMap((i) => {
            if (!stateChanges.has(i.id)) {
              seenIds.add(i.id);
              return [i];
            }
            const change = stateChanges.get(i.id);
            if (!change || seenIds.has(change.id)) return [];
            seenIds.add(change.id);
            return [change];
          });
          // A resolved create whose tempId slot is gone from state (a refresh wiped it
          // mid-sync) must be re-inserted, not dropped — it exists on the server.
          for (const tempId of tempIdByResolvedId.values()) {
            const change = stateChanges.get(tempId);
            if (change && !seenIds.has(change.id)) {
              seenIds.add(change.id);
              next.push(change);
            }
          }
          return next;
        });
      }
      if (hadConflict) {
        notifyUser(
          "Synced with changes from another device",
          "Someone else updated an item while you were offline. We've refreshed it with their latest changes."
        );
      }
      if (failedNames.length > 0) {
        const shown = failedNames.slice(0, 3).join(", ");
        const more = failedNames.length > 3 ? ` and ${failedNames.length - 3} more` : "";
        notifyUser(
          "Some offline changes couldn't sync",
          `The server rejected: ${shown}${more}. These changes were discarded.`
        );
      }
      if (needsRefresh) void refresh();
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
