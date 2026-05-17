import { detectItem } from "./keywordDetect";

export interface BulkQueueItem {
  id: string;
  barcode: string | null;
  name: string;
  category: string | null;
  fridgeDays: number | null;
  freezerDays: number | null;
  perishable: boolean;
  quantity: number;
}

let idCounter = 0;

export function nextBulkQueueId(): string {
  idCounter += 1;
  return String(idCounter);
}

/** Build a queue row from a display name (and optional barcode). */
export function buildBulkQueueItem(
  displayName: string,
  barcode: string | null = null
): BulkQueueItem {
  const detected = detectItem(displayName);
  return {
    id: nextBulkQueueId(),
    barcode,
    name: detected ? detected.name : displayName,
    category: detected ? detected.category : null,
    fridgeDays: detected ? detected.fridgeDays : null,
    freezerDays: detected ? detected.freezerDays : null,
    perishable: detected ? detected.perishable : true,
    quantity: 1,
  };
}

/** Merge incoming items into an existing list (combine quantities by canonical name). */
export function mergeBulkQueueItems(
  existing: BulkQueueItem[],
  incoming: BulkQueueItem[]
): BulkQueueItem[] {
  const merged = [...existing];
  for (const item of incoming) {
    const idx = merged.findIndex((m) => m.name.toLowerCase() === item.name.toLowerCase());
    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        quantity: merged[idx].quantity + item.quantity,
      };
    } else {
      merged.push(item);
    }
  }
  return merged;
}

/** Parse receipt-style line text into deduplicated queue items. */
export function parseReceiptLines(text: string): BulkQueueItem[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (l.length < 2) return false;
      if (/^\d+(\.\d+)?$/.test(l)) return false;
      if (/^[^a-zA-Z]+$/.test(l)) return false;
      return true;
    });

  const nameMap = new Map<string, BulkQueueItem>();

  for (const line of lines) {
    const item = buildBulkQueueItem(line, null);
    const key = item.name.toLowerCase();

    if (nameMap.has(key)) {
      const existing = nameMap.get(key)!;
      nameMap.set(key, { ...existing, quantity: existing.quantity + 1 });
    } else {
      nameMap.set(key, item);
    }
  }

  return Array.from(nameMap.values());
}
