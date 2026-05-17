import { useAuth } from "@/context/AuthContext";
import { normalizeItemName } from "@/lib/itemName";
import { cancelItemNotifications, rescheduleAllItems } from "@/lib/notifications";
import { parseItemRow } from "@/lib/supabaseRows";
import { supabase } from "@/lib/supabase";
import type { ItemRow, ItemScope, ItemStatus, StoragePlace } from "@/types";
import * as Sentry from "@sentry/react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

type ItemsContextValue = {
  items: ItemRow[];
  loading: boolean;
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
    }>
    ,
    expectedScheduleVersion?: number
  ) => Promise<{ error: Error | null; item?: ItemRow }>;
};

const ItemsContext = createContext<ItemsContextValue | null>(null);

export function ItemsProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, ensureProfile } = useAuth();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
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

  const refresh = useCallback(async () => {
    if (!user?.id || !profile?.household_id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: qerr } = await supabase
      .from("items")
      .select("*")
      .eq("household_id", profile.household_id)
      .order("spoil_on", { ascending: true });
    if (qerr) {
      setError(qerr.message);
      setItems([]);
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
      setItems((prev) => [...prev, item]);
      return { error: null, item };
    },
    [user?.id, profile?.household_id, ensureProfile]
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
      setItems((prev) => prev.map((i) => (i.id === id ? item : i)));
      return { error: null, item };
    },
    [profile, ensureProfile, refresh]
  );

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
