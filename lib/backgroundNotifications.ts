import { nativeNotificationsSupported, rescheduleAllItems } from "@/lib/notifications";
import { fetchProfileForUser } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { parseItemRow } from "@/lib/supabaseRows";
import type { ItemRow } from "@/types";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

export const BACKGROUND_NOTIFICATION_TASK = "freshkeep-background-notification-refresh";

/** Background tasks need a config-plugin build; Expo Go can't host the native module. */
const backgroundTasksSupported = nativeNotificationsSupported && Constants.appOwnership !== "expo";

async function refreshNotificationsInBackground(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const profile = await fetchProfileForUser(userId);
  if (!profile) return;

  const { data: rows, error } = await supabase
    .from("items")
    .select("*")
    .eq("household_id", profile.household_id)
    .order("spoil_on", { ascending: true });
  if (error || !rows) return;

  const items: ItemRow[] = [];
  for (const r of rows) {
    const pr = parseItemRow(r);
    if (pr.ok) items.push(pr.value);
  }

  await rescheduleAllItems(items, profile.notification_prefs);
}

// Must run at module scope: the OS relaunches the JS engine to invoke a registered task,
// and defineTask has to have already run by the time that happens.
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
  try {
    await refreshNotificationsInBackground();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    Sentry.captureException(err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Registers the periodic background refresh so item/notification changes made by other
 * household members (or missed foreground reschedules) get picked up even if this device's
 * app is never reopened. Safe to call repeatedly; no-ops if already registered.
 */
export async function registerBackgroundNotificationTaskAsync(): Promise<void> {
  if (Platform.OS === "web" || !backgroundTasksSupported) return;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    const already = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    if (already) return;
    await BackgroundTask.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, { minimumInterval: 60 });
  } catch (err) {
    Sentry.captureException(err);
  }
}
