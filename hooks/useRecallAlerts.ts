import { dismissRecallAlert, fetchRecallAlerts, type RecallAlert } from "@/lib/recalls";
import * as Sentry from "@sentry/react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";

/** Recall alerts for the household, refetched whenever the screen gains focus. */
export function useRecallAlerts() {
  const [alerts, setAlerts] = useState<RecallAlert[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchRecallAlerts()
        .then((next) => {
          if (active) setAlerts(next);
        })
        .catch((err) => Sentry.captureException(err));
      return () => {
        active = false;
      };
    }, [])
  );

  const byItem = useMemo(() => {
    const map = new Map<string, RecallAlert[]>();
    for (const a of alerts) map.set(a.item_id, [...(map.get(a.item_id) ?? []), a]);
    return map;
  }, [alerts]);

  const dismiss = useCallback(async (id: string) => {
    const { error } = await dismissRecallAlert(id);
    if (!error) setAlerts((prev) => prev.filter((a) => a.id !== id));
    return { error };
  }, []);

  return { alerts, byItem, dismiss };
}
