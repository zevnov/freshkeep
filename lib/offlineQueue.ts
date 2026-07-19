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

export type EnqueueResult = { ok: true } | { ok: false; reason: "full" | "storage" };

const QUEUE_KEY = "freshkeep-offline-queue";
export const MAX_QUEUE_SIZE = 100;

// All queue access goes through this chain so concurrent read-modify-write cycles
// (e.g. two mutations queued in quick succession) can't clobber each other.
let opChain: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = opChain.then(fn, fn);
  opChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

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
export function peek(): Promise<QueuedMutation[]> {
  return serialized(readQueue);
}

/** Appends a mutation. Never throws: reports a full queue or a failed storage write via `ok: false`. */
export function enqueue(mutation: QueuedMutation): Promise<EnqueueResult> {
  return serialized(async (): Promise<EnqueueResult> => {
    const queue = await readQueue();
    if (queue.length >= MAX_QUEUE_SIZE) {
      return { ok: false, reason: "full" };
    }
    try {
      await writeQueue([...queue, mutation]);
      return { ok: true };
    } catch {
      return { ok: false, reason: "storage" };
    }
  });
}

export function mutationKey(m: QueuedMutation): string {
  return m.type === "create" ? `create:${m.tempId}` : `update:${m.itemId}:${m.timestamp}`;
}

/**
 * Applies the outcome of processed mutations to the persisted queue. Re-reads current storage
 * inside the write lock so mutations enqueued by the user *during* a sync pass survive.
 * `resolutions` maps a processed mutation's key to `null` (synced or permanently failed — drop
 * it) or a replacement mutation (still pending — e.g. its itemId remapped from a tempId to the
 * real row id). Call after EACH mutation resolves, not once per batch: if the app dies mid-sync,
 * already-applied creates must not replay as duplicates.
 */
export function applySyncResolutions(resolutions: Map<string, QueuedMutation | null>): Promise<void> {
  return serialized(async () => {
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
  });
}
