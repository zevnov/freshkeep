import {
  buildBulkQueueItem,
  mergeBulkQueueItems,
  parseReceiptLines,
} from "@/lib/bulkScanItems";

describe("buildBulkQueueItem", () => {
  it("normalizes detected names", () => {
    const item = buildBulkQueueItem("organic strawberries");
    expect(item.name).toBe("strawberry");
    expect(item.category).toBe("fruit");
  });
});

describe("parseReceiptLines", () => {
  it("parses and deduplicates lines", () => {
    const items = parseReceiptLines("Strawberries\nWhole milk\nStrawberries");
    expect(items).toHaveLength(2);
    const berry = items.find((i) => i.name === "strawberry");
    expect(berry?.quantity).toBe(2);
  });

  it("skips numeric-only lines", () => {
    expect(parseReceiptLines("12.99\nMilk")).toHaveLength(1);
  });
});

describe("mergeBulkQueueItems", () => {
  it("combines quantities for same canonical name", () => {
    const a = buildBulkQueueItem("milk");
    const b = buildBulkQueueItem("whole milk");
    const merged = mergeBulkQueueItems([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(2);
  });
});
