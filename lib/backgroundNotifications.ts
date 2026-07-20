import { nativeNotificationsSupported, rescheduleAllItems } from "@/lib/notifications";
import { fetchProfileForUser } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { parseItemRow } from "@/lib/supabaseRows";
import type { ItemRow } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

export const BACKGROUND_NOTIFICATION_TASK = "freshkeep-background-notification-refresh";
const BACKGROUND_REFRESH_MINIMUM_INTERVAL_SECONDS = 60;
const REGISTERED_INTERVAL_KEY = "freshkeep-bg-notification-task-interval";

/** Background tasks need a config-plugin build; Expo Go can't host the native module. */
const backgroundTasksSupported = nativeNotificationsSupported && Constants.appOwnership !== "expo";

type RefreshOutcome =
  | { ok: true }
  | { ok: false; reason: "no-session" | "no-profile" };

/**
 * Distinguishes genuine no-ops (not signed in, no profile yet) from real failures (a query
 * that actually errored). The caller reports both differently: real errors are exceptions
 * that get captured and turn the task Failed; no-ops are reported at info level so a broken
 * refresh is no longer indistinguishable from a healthy one that had nothing to do.
 */
async function refreshNotificationsInBackground(): Promise<RefreshOutcome> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`getSession failed: ${sessionError.message}`);
  const userId = sessionData.session?.user?.id;
  if (!userId) return { ok: false, reason: "no-session" };

  const profile = await fetchProfileForUser(userId);
  if (!profile) return { ok: false, reason: "no-profile" };

  const { data: rows, error } = await supabase
    .from("items")
    .select("*")
    .eq("household_id", profile.household_id)
    .order("spoil_on", { ascending: true });
  if (error) throw new Error(`items fetch failed: ${error.message}`);

  const items: ItemRow[] = [];
  let malformedCount = 0;
  for (const r of rows ?? []) {
    const pr = parseItemRow(r);
    if (pr.ok) items.push(pr.value);
    else malformedCount += 1;
  }
  if (malformedCount > 0) {
    // Foreground refresh() surfaces this as a visible error; the background path has no UI
    // to surface it to, so report it here instead of dropping the rows silently.
    Sentry.captureMessage(
      `Background notification refresh: ${malformedCount} malformed item row(s) skipped`,
      "warning"
    );
  }

  await rescheduleAllItems(items, profile.notification_prefs);
  return { ok: true };
}

// Must run at module scope: the OS relaunches the JS engine to invoke a registered task,
// and defineTask has to have already run by the time that happens.
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
  try {
    const result = await refreshNotificationsInBackground();
    if (!result.ok) {
      Sentry.captureMessage(`Background notification refresh skipped: ${result.reason}`, "info");
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    Sentry.captureException(err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Registers the periodic background refresh so item/notification changes made by other
 * household members (or missed foreground reschedules) get picked up even if this device's
 * app is never reopened. Safe to call repeatedly; re-registers if the desired interval has
 * changed since this device last registered, so a future tuning of the interval takes effect
 * without requiring a reinstall.
 */
export async function registerBackgroundNotificationTaskAsync(): Promise<void> {
  if (Platform.OS === "web" || !backgroundTasksSupported) return;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;

    const already = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    const desiredInterval = String(BACKGROUND_REFRESH_MINIMUM_INTERVAL_SECONDS);

    if (already) {
      const registeredInterval = await AsyncStorage.getItem(REGISTERED_INTERVAL_KEY);
      if (registeredInterval === desiredInterval) return;
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
      minimumInterval: BACKGROUND_REFRESH_MINIMUM_INTERVAL_SECONDS,
    });
    await AsyncStorage.setItem(REGISTERED_INTERVAL_KEY, desiredInterval);
  } catch (err) {
    Sentry.captureException(err);
  }
}
