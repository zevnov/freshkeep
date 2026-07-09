import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CreateItemPayload, UpdateItemPatch } from "@/types";

export type QueuedMutation =
  | { type: "create"; tempId: string; payload: CreateItemPayload; timestamp: string }
  | {
      type: "update";
      itemId: string;
      patch: UpdateItemPatch;
      expectedScheduleVersion: number;
      timestamp: string;
    };

const QUEUE_KEY = "freshkeep-offline-queue";
export const MAX_QUEUE_SIZE = 100;

async function readQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Reads the queue without removing anything from it. */
export async function peek(): Promise<QueuedMutation[]> {
  return readQueue();
}

/** Appends a mutation. Returns `dropped: true` (queue left unchanged) once the size cap is hit. */
export async function enqueue(
  mutation: QueuedMutation
): Promise<{ queue: QueuedMutation[]; dropped: boolean }> {
  const queue = await readQueue();
  if (queue.length >= MAX_QUEUE_SIZE) {
    return { queue, dropped: true };
  }
  const next = [...queue, mutation];
  await writeQueue(next);
  return { queue: next, dropped: false };
}

export function mutationKey(m: QueuedMutation): string {
  return m.type === "create" ? `create:${m.tempId}` : `update:${m.itemId}:${m.timestamp}`;
}

/**
 * Applies the outcome of a sync pass to the persisted queue. Re-reads current storage first so
 * mutations enqueued by the user *during* the sync (not part of the processed batch) survive.
 * `resolutions` maps a processed mutation's key to `null` (succeeded — drop it) or a replacement
 * mutation (still pending — e.g. its itemId was remapped from a tempId to the row's real id).
 */
export async function applySyncResolutions(resolutions: Map<string, QueuedMutation | null>): Promise<void> {
  const current = await readQueue();
  const next: QueuedMutation[] = [];
  for (const m of current) {
    const key = mutationKey(m);
    if (!resolutions.has(key)) {
      next.push(m);
      continue;
    }
    const resolution = resolutions.get(key);
    if (resolution) next.push(resolution);
  }
  await writeQueue(next);
}
