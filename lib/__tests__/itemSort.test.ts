import { groupByCategory, isItemSort, itemCategory, sortItems } from "@/lib/itemSort";
import { makeItem } from "./itemFixture";

const items = [
  makeItem({ id: "1", name: "bananas", spoil_on: "2099-01-05", created_at: "2026-01-02T00:00:00Z" }),
  makeItem({ id: "2", name: "Whole milk", spoil_on: "2099-01-02", category: "dairy", created_at: "2026-01-03T00:00:00Z" }),
  makeItem({ id: "3", name: "Apples", spoil_on: "2099-01-09", created_at: "2026-01-01T00:00:00Z" }),
  makeItem({ id: "4", name: "Mystery jar", spoil_on: "2099-01-01", created_at: "2026-01-04T00:00:00Z" }),
];

const names = (list: { name: string }[]) => list.map((i) => i.name);

describe("sortItems", () => {
  it("sorts A–Z ignoring case", () => {
    expect(names(sortItems(items, "az", 3))).toEqual(["Apples", "bananas", "Mystery jar", "Whole milk"]);
  });

  it("sorts newest added first", () => {
    expect(names(sortItems(items, "added", 3))).toEqual(["Mystery jar", "Whole milk", "bananas", "Apples"]);
  });

  it("sorts by spoil date for urgency", () => {
    expect(names(sortItems(items, "urgency", 3))).toEqual(["Mystery jar", "Whole milk", "bananas", "Apples"]);
  });

  it("orders food types alphabetically with Other last", () => {
    expect(names(sortItems(items, "type", 3))).toEqual(["Whole milk", "bananas", "Apples", "Mystery jar"]);
  });
});

describe("groupByCategory", () => {
  it("labels groups and keeps the most urgent first inside each", () => {
    const groups = groupByCategory(items, 3);
    expect(groups.map((g) => g.label)).toEqual(["Dairy", "Fruit", "Other"]);
    expect(names(groups[1].items)).toEqual(["bananas", "Apples"]);
  });
});

describe("itemCategory", () => {
  it("prefers the stored category, then detection", () => {
    expect(itemCategory({ name: "bananas", category: "snack" })).toBe("snack");
    expect(itemCategory({ name: "bananas", category: null })).toBe("fruit");
    expect(itemCategory({ name: "zzz", category: null })).toBeNull();
  });
});

describe("isItemSort", () => {
  it("accepts only known keys", () => {
    expect(isItemSort("az")).toBe(true);
    expect(isItemSort("price")).toBe(false);
    expect(isItemSort(null)).toBe(false);
  });
});
