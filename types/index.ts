export type ItemScope = "ours" | "mine";
export type StoragePlace = "fridge" | "freezer" | "pantry" | "counter";
export type ItemStatus = "active" | "consumed" | "trashed";

export type FreshnessBand = "fresh" | "soon" | "today" | "overdue";

export type SpoilMode = "expiry" | "shelf";

export type ItemRow = {
  id: string;
  household_id: string;
  /** Null for shared ("ours") items that no one has claimed. */
  owner_user_id: string | null;
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
  schedule_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationStyle = "individual" | "digest";

export type NotificationPrefs = {
  masterEnabled: boolean;
  /** Per-item alerts vs one daily summary */
  notificationStyle: NotificationStyle;
  notifySoon: boolean;
  notifyToday: boolean;
  notifyOverdue: boolean;
  defaultSoonDays: number;
  soonHour: number;
  todayHour: number;
  overdueHour: number;
  /** Local time for daily digest (0–23, 0–59) */
  digestHour: number;
  digestMinute: number;
  includeMine: boolean;
};

export type CreateItemPayload = {
  scope: ItemScope;
  name: string;
  storage: StoragePlace;
  spoil_on: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  remind_me: boolean;
  remind_days_before: number;
};

export type UpdateItemPatch = Partial<{
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
}>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  masterEnabled: true,
  notificationStyle: "individual",
  notifySoon: true,
  notifyToday: true,
  notifyOverdue: true,
  defaultSoonDays: 3,
  soonHour: 9,
  todayHour: 8,
  overdueHour: 8,
  digestHour: 8,
  digestMinute: 0,
  includeMine: true,
};
