import { useItems } from "@/context/ItemsContext";
import type { BulkQueueItem } from "@/lib/bulkScanItems";
import { calculateExpiry } from "@/lib/expiryEngine";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

export type BulkSaveFailure = {
  name: string;
  message: string;
};

export type BulkSaveResult = {
  saved: number;
  failures: BulkSaveFailure[];
  total: number;
};

export function useBulkItemQueue() {
  const { createItem } = useItems();
  const [items, setItems] = useState<BulkQueueItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showClearModal, setShowClearModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const clearItems = useCallback(() => {
    setItems([]);
    setShowClearModal(false);
  }, []);

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const startEdit = useCallback((item: BulkQueueItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (trimmed) {
      setItems((prev) =>
        prev.map((i) => (i.id === editingId ? { ...i, name: trimmed } : i))
      );
    }
    setEditingId(null);
    setEditingName("");
  }, [editingId, editingName]);

  const expiryLabelFor = useCallback((item: BulkQueueItem): string => {
    const storage = item.perishable ? ("fridge" as const) : ("pantry" as const);
    return calculateExpiry(item.name, storage, false).message;
  }, []);

  const saveAll = useCallback(async (): Promise<BulkSaveResult> => {
    if (items.length === 0) {
      return { saved: 0, failures: [], total: 0 };
    }

    setSaving(true);
    const failures: BulkSaveFailure[] = [];
    const savedIds = new Set<string>();
    let saved = 0;

    for (const item of items) {
      const storage = item.perishable ? ("fridge" as const) : ("pantry" as const);
      const { spoilDate: spoilOn } = calculateExpiry(item.name, storage, false);
      const { error } = await createItem({
        scope: "ours",
        name: item.name,
        storage,
        spoil_on: spoilOn,
        quantity: item.quantity,
        unit: null,
        notes: null,
        remind_me: false,
        remind_days_before: 0,
      });

      if (error) {
        failures.push({ name: item.name, message: error.message });
      } else {
        saved += 1;
        savedIds.add(item.id);
      }
    }

    if (savedIds.size > 0) {
      setItems((prev) => prev.filter((i) => !savedIds.has(i.id)));
    }

    setSaving(false);
    return { saved, failures, total: items.length };
  }, [items, createItem]);

  const saveAllWithFeedback = useCallback(
    async (onAllSaved: () => void): Promise<void> => {
      const result = await saveAll();

      if (result.total === 0) {
        onAllSaved();
        return;
      }

      if (result.failures.length === 0) {
        onAllSaved();
        return;
      }

      const failedNames = result.failures
        .slice(0, 3)
        .map((f) => f.name)
        .join(", ");
      const more =
        result.failures.length > 3
          ? ` and ${result.failures.length - 3} more`
          : "";

      if (result.saved === 0) {
        Alert.alert(
          "Could not save items",
          result.failures.length === 1
            ? `${result.failures[0].name}: ${result.failures[0].message}`
            : `None of your ${result.total} items could be saved. ${failedNames}${more}`
        );
        return;
      }

      Alert.alert(
        "Partially saved",
        `${result.saved} of ${result.total} items saved. Could not save: ${failedNames}${more}. Failed items remain in your list.`,
        [{ text: "OK" }]
      );
    },
    [saveAll]
  );

  return {
    items,
    setItems,
    editingId,
    editingName,
    setEditingName,
    showClearModal,
    setShowClearModal,
    showExitModal,
    setShowExitModal,
    saving,
    clearItems,
    deleteItem,
    startEdit,
    commitEdit,
    expiryLabelFor,
    saveAllWithFeedback,
  };
}
