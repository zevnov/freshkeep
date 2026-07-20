import { filterItemsByQuery, searchKnowledgeBase } from "@/lib/search";

describe("filterItemsByQuery", () => {
  const items = [{ name: "Whole Milk" }, { name: "Almond Milk" }, { name: "Eggs" }];

  it("returns everything for an empty or whitespace query", () => {
    expect(filterItemsByQuery(items, "")).toEqual(items);
    expect(filterItemsByQuery(items, "   ")).toEqual(items);
  });

  it("matches case-insensitively as a substring", () => {
    expect(filterItemsByQuery(items, "milk")).toEqual([{ name: "Whole Milk" }, { name: "Almond Milk" }]);
    expect(filterItemsByQuery(items, "EGG")).toEqual([{ name: "Eggs" }]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterItemsByQuery(items, "salmon")).toEqual([]);
  });
});

describe("searchKnowledgeBase", () => {
  it("returns no suggestions for an empty query", () => {
    expect(searchKnowledgeBase("")).toEqual([]);
    expect(searchKnowledgeBase("   ")).toEqual([]);
  });

  it("ranks an exact name match first", () => {
    const results = searchKnowledgeBase("apple");
    expect(results[0].name).toBe("apple");
  });

  it("ranks a name prefix above a substring match elsewhere in the name", () => {
    const results = searchKnowledgeBase("app");
    expect(results[0].name).toBe("apple");
  });

  it("matches on keywords, not just the canonical name", () => {
    const results = searchKnowledgeBase("mandarin");
    expect(results.some((r) => r.name === "tangerine")).toBe(true);
  });

  it("caps results at the requested limit", () => {
    const results = searchKnowledgeBase("e", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("returns nothing for a query with no match anywhere", () => {
    expect(searchKnowledgeBase("xyzzyplugh")).toEqual([]);
  });
});
