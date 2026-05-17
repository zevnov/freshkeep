import type { StoragePlace } from "@/types";
import { detectItem, type DetectedItem } from "./keywordDetect";
import { toLocalDateString } from "./spoil";

export interface ExpiryResult {
  spoilDate: string;          // YYYY-MM-DD
  confidence: "exact" | "estimated" | "unknown";
  matchedItem: DetectedItem | null;
  message: string;            // Human-readable: "~5 days in fridge"
}

/**
 * Smart expiry calculator. Takes an item name, where it's stored, and whether it's opened,
 * and returns the best estimate for when it'll spoil.
 */
export function calculateExpiry(
  itemName: string,
  storage: StoragePlace,
  opened: boolean,
  referenceDate: Date = new Date()
): ExpiryResult {
  const detected = detectItem(itemName);

  // No match in knowledge base — manual entry needed
  if (!detected) {
    return {
      spoilDate: toLocalDateString(addDays(referenceDate, 7)), // default 7 days
      confidence: "unknown",
      matchedItem: null,
      message: "Unknown item — set expiry manually",
    };
  }

  // Determine base days from storage type
  let days: number;
  let storageLabel: string;

  switch (storage) {
    case "freezer":
      if (detected.freezerDays != null) {
        days = detected.freezerDays;
        storageLabel = "frozen";
      } else {
        // Can't freeze this — fall back to fridge
        days = detected.fridgeDays ?? 7;
        storageLabel = "fridge";
      }
      break;
    case "pantry":
    case "counter":
      if (!detected.perishable) {
        days = 365; // Non-perishable = ~1 year
        storageLabel = storage;
      } else {
        // Perishable on counter — shorter than fridge
        days = Math.round((detected.fridgeDays ?? 7) * 0.4);
        storageLabel = storage;
      }
      break;
    case "fridge":
    default:
      days = detected.fridgeDays ?? 7;
      storageLabel = "fridge";
      break;
  }

  // If opened, halve the shelf life (minimum 1 day)
  if (opened) {
    days = Math.max(1, Math.round(days / 2));
  }

  const spoilDate = toLocalDateString(addDays(referenceDate, days));
  const message = opened
    ? `~${days}d opened in ${storageLabel}`
    : `~${days}d in ${storageLabel}`;

  return {
    spoilDate,
    confidence: "estimated",
    matchedItem: detected,
    message,
  };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Get the suggested storage type for a detected item */
export function suggestStorage(detected: DetectedItem | null): StoragePlace {
  if (!detected) return "fridge";
  if (!detected.perishable) return "pantry";
  return "fridge"; // perishable items default to fridge
}
