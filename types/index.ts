export type ItemScope = "ours" | "mine";
export type StoragePlace = "fridge" | "freezer" | "pantry" | "counter";
export type ItemStatus = "active" | "consumed" | "trashed";

export type FreshnessBand = "fresh" | "soon" | "today" | "overdue";

export type SpoilMode = "expiry" | "shelf";

/** Nutrition facts for a product, as the manufacturer reports them on Open Food Facts. */
export type ItemNutrition = {
  /** What the numbers are per: one serving (see `serving_size`) or 100 g/ml. */
  basis: "serving" | "100g";
  serving_size: string | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

/** Product details captured when an item comes from a barcode scan or quick-add search. */
export type ItemProductInfo = {
  barcode: string | null;
  brand: string | null;
  image_url: string | null;
  nutrition: ItemNutrition | null;
  /** Manufacturer storage instructions, e.g. "Keep refrigerated after opening." */
  storage_tip: string | null;
};

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
  /** Food type from the knowledge base (e.g. "dairy"); null when unknown. */
  category: string | null;
  /** Emoji the user picked for this item; null falls back to the category's icon. */
  icon: string | null;
} & ItemProductInfo;

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
  category?: string | null;
  icon?: string | null;
} & Partial<ItemProductInfo>;

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
  category: string | null;
  icon: string | null;
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
