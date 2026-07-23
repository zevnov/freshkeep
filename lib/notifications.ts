import Constants from "expo-constants";
import { Platform } from "react-native";
import type { DailyTriggerInput } from "expo-notifications";
import type { ItemRow, ItemScope, NotificationPrefs } from "@/types";
import { addDaysLocal, computeFreshnessBand, parseLocalDate, toLocalDateString } from "@/lib/spoil";

type ExpoNotifications = typeof import("expo-notifications");

/**
 * Web: `expo-notifications` has no native implementation, so all scheduling stays a silent no-op.
 * Expo Go on Android (SDK 53+): `expo-notifications` native APIs are disabled; use a dev build to test alerts.
 * @see https://docs.expo.dev/develop/development-builds/introduction/
 */
export const nativeNotificationsSupported =
  Platform.OS !== "web" && !(Constants.appOwnership === "expo" && Platform.OS === "android");

let notificationsModule: ExpoNotifications | null = null;

function getNotifications(): ExpoNotifications | null {
  if (!nativeNotificationsSupported) return null;
  if (!notificationsModule) {
    notificationsModule = require("expo-notifications") as ExpoNotifications;
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
  return notificationsModule;
}

let channelReady = false;

export const DIGEST_NOTIFICATION_ID = "fk-digest-daily";

export async function getExpoNotificationPermissionsAsync(): Promise<{ status: string } | null> {
  const N = getNotifications();
  if (!N) return null;
  return N.getPermissionsAsync();
}

export async function requestExpoNotificationPermissionsAsync(): Promise<{ status: string } | null> {
  const N = getNotifications();
  if (!N) return null;
  return N.requestPermissionsAsync();
}

export async function ensureNotificationChannel(): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  if (channelReady) return;
  if (Platform.OS === "android") {
    await N.setNotificationChannelAsync("freshkeep", {
      name: "Freshkeep",
      importance: N.AndroidImportance.DEFAULT,
    });
  }
  channelReady = true;
}

function notificationIds(itemId: string): { soon: string; today: string; overdue: string } {
  return {
    soon: `fk-${itemId}-soon`,
    today: `fk-${itemId}-today`,
    overdue: `fk-${itemId}-overdue`,
  };
}

function atLocalHour(ymd: string, hour: number): Date {
  const d = parseLocalDate(ymd);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function storageLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function scopeLabel(scope: ItemScope): string {
  return scope === "ours" ? "Ours" : "My";
}

export async function cancelDigestNotification(): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(DIGEST_NOTIFICATION_ID);
  } catch {
    /* ignore */
  }
}

export async function cancelItemNotifications(itemId: string): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  const ids = notificationIds(itemId);
  for (const id of Object.values(ids)) {
    try {
      await N.cancelScheduledNotificationAsync(id);
    } catch {
      /* ignore */
    }
  }
}

export function countDigestBuckets(
  items: ItemRow[],
  prefs: NotificationPrefs,
  todayYmd: string = toLocalDateString(new Date())
): { soon: number; today: number; overdue: number } {
  const soonDays = prefs.defaultSoonDays;
  let soon = 0;
  let today = 0;
  let overdue = 0;
  for (const item of items) {
    if (item.status !== "active" || !item.remind_me) continue;
    if (item.scope === "mine" && !prefs.includeMine) continue;
    const band = computeFreshnessBand(item.spoil_on, soonDays, todayYmd);
    if (band === "soon" && prefs.notifySoon) soon += 1;
    else if (band === "today" && prefs.notifyToday) today += 1;
    else if (band === "overdue" && prefs.notifyOverdue) overdue += 1;
  }
  return { soon, today, overdue };
}

export function buildDigestBody(
  prefs: NotificationPrefs,
  counts: { soon: number; today: number; overdue: number }
): string {
  const parts: string[] = [];
  if (prefs.notifySoon && counts.soon > 0) parts.push(`${counts.soon} use soon`);
  if (prefs.notifyToday && counts.today > 0) parts.push(`${counts.today} due today`);
  if (prefs.notifyOverdue && counts.overdue > 0) parts.push(`${counts.overdue} overdue`);
  if (parts.length === 0) return "Nothing urgent in your lists right now.";
  return parts.join(" · ");
}

export async function scheduleDigestNotification(items: ItemRow[], prefs: NotificationPrefs): Promise<void> {
  const N = getNotifications();
  if (!N) return;

  await ensureNotificationChannel();
  await cancelDigestNotification();

  if (!prefs.masterEnabled || prefs.notificationStyle !== "digest") return;
  const anyBand = prefs.notifySoon || prefs.notifyToday || prefs.notifyOverdue;
  if (!anyBand) return;

  const counts = countDigestBuckets(items, prefs);
  const body = buildDigestBody(prefs, counts);
  const hour = Math.min(23, Math.max(0, prefs.digestHour));
  const minute = Math.min(59, Math.max(0, prefs.digestMinute));

  const trigger: DailyTriggerInput = {
    type: N.SchedulableTriggerInputTypes.DAILY,
    hour,
    minute,
    ...(Platform.OS === "android" ? { channelId: "freshkeep" } : {}),
  };

  await N.scheduleNotificationAsync({
    identifier: DIGEST_NOTIFICATION_ID,
    content: {
      title: "Freshkeep · Kitchen digest",
      body,
    },
    trigger,
  });
}

export async function scheduleItemNotifications(
  item: ItemRow,
  prefs: NotificationPrefs
): Promise<void> {
  const N = getNotifications();
  if (!N) return;

  await ensureNotificationChannel();
  await cancelItemNotifications(item.id);

  if (prefs.notificationStyle === "digest") return;
  if (!prefs.masterEnabled || item.status !== "active" || !item.remind_me) return;
  if (item.scope === "mine" && !prefs.includeMine) return;
  if (!prefs.notifySoon && !prefs.notifyToday && !prefs.notifyOverdue) return;

  const now = new Date();
  const soonWindowDays = item.remind_days_before > 0 ? item.remind_days_before : prefs.defaultSoonDays;
  const soonStartYmd = addDaysLocal(item.spoil_on, -Math.max(1, soonWindowDays));

  const ids = notificationIds(item.id);
  const bodySuffix = `${scopeLabel(item.scope)} · ${storageLabel(item.storage)}`;

  if (prefs.notifySoon) {
    const soonDate = atLocalHour(soonStartYmd, prefs.soonHour);
    if (soonDate > now && soonStartYmd < item.spoil_on) {
      await N.scheduleNotificationAsync({
        identifier: ids.soon,
        content: {
          title: `Use soon: ${item.name}`,
          body: `${bodySuffix} · use by ${item.spoil_on}`,
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DATE,
          date: soonDate,
          channelId: Platform.OS === "android" ? "freshkeep" : undefined,
        },
      });
    }
  }

  if (prefs.notifyToday) {
    const todayDate = atLocalHour(item.spoil_on, prefs.todayHour);
    if (todayDate > now) {
      await N.scheduleNotificationAsync({
        identifier: ids.today,
        content: {
          title: `Today: ${item.name}`,
          body: `Use or freeze by today · ${storageLabel(item.storage)}`,
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DATE,
          date: todayDate,
          channelId: Platform.OS === "android" ? "freshkeep" : undefined,
        },
      });
    }
  }

  if (prefs.notifyOverdue) {
    const overdueYmd = addDaysLocal(item.spoil_on, 1);
    const overdueDate = atLocalHour(overdueYmd, prefs.overdueHour);
    if (overdueDate > now) {
      await N.scheduleNotificationAsync({
        identifier: ids.overdue,
        content: {
          title: `Overdue: ${item.name}`,
          body: `Past use-by · still in ${storageLabel(item.storage)}?`,
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DATE,
          date: overdueDate,
          channelId: Platform.OS === "android" ? "freshkeep" : undefined,
        },
      });
    }
  }
}

export async function rescheduleAllItems(items: ItemRow[], prefs: NotificationPrefs): Promise<void> {
  const N = getNotifications();
  if (!N) return;

  await ensureNotificationChannel();

  const anyBand = prefs.notifySoon || prefs.notifyToday || prefs.notifyOverdue;
  const digestMode = prefs.masterEnabled && anyBand && prefs.notificationStyle === "digest";
  const individualMode = prefs.masterEnabled && anyBand && prefs.notificationStyle !== "digest";
  const active = items.filter((i) => i.status === "active");

  // Schedule what should exist first, then cancel what's now stale. Each schedule call
  // reuses a deterministic identifier, so it overwrites any prior notification under that
  // id rather than leaving a gap — if the task is killed partway through, items already
  // processed keep a valid (old-or-new) notification instead of none at all.
  if (digestMode) {
    await scheduleDigestNotification(items, prefs);
  } else {
    await cancelDigestNotification();
  }

  if (individualMode) {
    for (const item of active) {
      await scheduleItemNotifications(item, prefs);
    }
  } else {
    for (const item of active) {
      await cancelItemNotifications(item.id);
    }
  }

  // Items that are no longer active (consumed/trashed) never go through the loop above.
  const activeIds = new Set(active.map((i) => i.id));
  for (const item of items) {
    if (!activeIds.has(item.id)) await cancelItemNotifications(item.id);
  }
}
