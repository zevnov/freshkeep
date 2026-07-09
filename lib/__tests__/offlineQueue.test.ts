import AsyncStorage from "@react-native-async-storage/async-storage";
import { applySyncResolutions, enqueue, MAX_QUEUE_SIZE, mutationKey, peek, type QueuedMutation } from "@/lib/offlineQueue";

const createPayload = {
  scope: "ours" as const,
  name: "Milk",
  storage: "fridge" as const,
  spoil_on: "2026-07-15",
  quantity: 1,
  unit: null,
  notes: null,
  remind_me: false,
  remind_days_before: 0,
};

function createMutation(tempId: string): QueuedMutation {
  return { type: "create", tempId, payload: createPayload, timestamp: `${tempId}-ts` };
}

function updateMutation(itemId: string, version = 0): Extract<QueuedMutation, { type: "update" }> {
  return {
    type: "update",
    itemId,
    patch: { name: "Eggs" },
    expectedScheduleVersion: version,
    timestamp: `${itemId}-${version}-ts`,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("enqueue / peek", () => {
  it("appends mutations in order without removing them", async () => {
    await enqueue(createMutation("a"));
    await enqueue(updateMutation("b"));
    const queue = await peek();
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({ type: "create", tempId: "a" });
    expect(queue[1]).toMatchObject({ type: "update", itemId: "b" });
  });

  it("drops mutations once the queue is at capacity", async () => {
    for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
      const { dropped } = await enqueue(createMutation(`item-${i}`));
      expect(dropped).toBe(false);
    }
    const { dropped, queue } = await enqueue(createMutation("overflow"));
    expect(dropped).toBe(true);
    expect(queue).toHaveLength(MAX_QUEUE_SIZE);
  });
});

describe("applySyncResolutions", () => {
  it("drops mutations resolved to null and keeps everything else untouched", async () => {
    const create = createMutation("a");
    const update = updateMutation("b");
    await enqueue(create);
    await enqueue(update);

    await applySyncResolutions(new Map([[mutationKey(create), null]]));

    const remaining = await peek();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ type: "update", itemId: "b" });
  });

  it("replaces a mutation's itemId when a dependent create resolves to a real id", async () => {
    const create = createMutation("temp-a");
    const update = updateMutation("temp-a");
    await enqueue(create);
    await enqueue(update);

    const remapped: QueuedMutation = { ...update, itemId: "real-a" };
    await applySyncResolutions(
      new Map([
        [mutationKey(create), null],
        [mutationKey(update), remapped],
      ])
    );

    const remaining = await peek();
    expect(remaining).toEqual([remapped]);
  });

  it("preserves mutations enqueued by the user while a sync pass was in flight", async () => {
    const create = createMutation("a");
    await enqueue(create);

    // Simulate: sync reads the queue (just `create`), then the user adds another item
    // before the sync writes its resolutions back.
    const batch = await peek();
    expect(batch).toHaveLength(1);
    const midSyncMutation = createMutation("b");
    await enqueue(midSyncMutation);

    await applySyncResolutions(new Map([[mutationKey(create), null]]));

    const remaining = await peek();
    expect(remaining).toEqual([midSyncMutation]);
  });
});
