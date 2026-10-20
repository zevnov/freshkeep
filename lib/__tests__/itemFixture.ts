import type { ItemRow } from "@/types";

/** A complete active "ours" item; tests override only the fields they care about. */
export function makeItem(partial: Partial<ItemRow> & Pick<ItemRow, "id" | "name" | "spoil_on">): ItemRow {
  return {
    household_id: "h1",
    owner_user_id: "u1",
    scope: "ours",
    storage: "fridge",
    quantity: null,
    unit: null,
    notes: null,
    remind_me: true,
    remind_days_before: 0,
    status: "active",
    schedule_version: 0,
    created_by: "u1",
    created_at: "",
    updated_at: "",
    category: null,
    icon: null,
    barcode: null,
    brand: null,
    image_url: null,
    nutrition: null,
    storage_tip: null,
    ...partial,
  };
}
