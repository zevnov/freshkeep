import { EXPIRY_KNOWLEDGE, type ExpiryItem } from "@/lib/expiryKnowledge";

describe("EXPIRY_KNOWLEDGE — size and structure", () => {
  it("has at least 300 items", () => {
    expect(EXPIRY_KNOWLEDGE.length).toBeGreaterThanOrEqual(300);
  });

  it("every item has a non-empty name string", () => {
    const bad = EXPIRY_KNOWLEDGE.filter(
      (item) => typeof item.name !== "string" || item.name.trim() === ""
    );
    expect(bad).toHaveLength(0);
  });

  it("every item has a non-empty category string", () => {
    const bad = EXPIRY_KNOWLEDGE.filter(
      (item) => typeof item.category !== "string" || item.category.trim() === ""
    );
    expect(bad).toHaveLength(0);
  });

  it("every item has at least one keyword", () => {
    const bad = EXPIRY_KNOWLEDGE.filter(
      (item) => !Array.isArray(item.keywords) || item.keywords.length === 0
    );
    expect(bad).toHaveLength(0);
  });

  it("no duplicate names", () => {
    const names = EXPIRY_KNOWLEDGE.map((item) => item.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

describe("EXPIRY_KNOWLEDGE — data integrity", () => {
  it("perishable items with non-null fridgeDays have fridgeDays > 0", () => {
    const bad = EXPIRY_KNOWLEDGE.filter(
      (item) =>
        item.perishable &&
        item.fridgeDays !== null &&
        item.fridgeDays <= 0
    );
    expect(bad).toHaveLength(0);
  });

  it("non-perishable items have perishable=false", () => {
    // Sanity check: items without fridgeDays or freezerDays lifetimes that would expire quickly
    // aren't accidentally flagged as perishable.
    const pantryItems = EXPIRY_KNOWLEDGE.filter(
      (item) => item.category === "pantry"
    );
    const wronglyMarked = pantryItems.filter(
      (item) => item.perishable === true && item.fridgeDays === null
    );
    // Pantry items with null fridgeDays should not be perishable
    expect(wronglyMarked).toHaveLength(0);
  });

  it("perishable items have reasonable fridgeDays (1–400) when set", () => {
    const bad = EXPIRY_KNOWLEDGE.filter(
      (item) =>
        item.perishable &&
        item.fridgeDays !== null &&
        (item.fridgeDays < 1 || item.fridgeDays > 400)
    );
    expect(bad).toHaveLength(0);
  });

  it("freezerDays, when set, are reasonable (7–730)", () => {
    const bad = EXPIRY_KNOWLEDGE.filter(
      (item) =>
        item.freezerDays !== null &&
        (item.freezerDays < 7 || item.freezerDays > 730)
    );
    expect(bad).toHaveLength(0);
  });
});

describe("EXPIRY_KNOWLEDGE — category coverage", () => {
  const categories = EXPIRY_KNOWLEDGE.map((item) => item.category);

  it.each([
    ["fruit"],
    ["vegetable"],
    ["dairy"],
    ["meat"],
    ["pantry"],
  ])("has items in the '%s' category", (cat) => {
    expect(categories).toContain(cat);
  });

  it("fruit category has at least 10 items", () => {
    const fruits = EXPIRY_KNOWLEDGE.filter((item) => item.category === "fruit");
    expect(fruits.length).toBeGreaterThanOrEqual(10);
  });

  it("vegetable category has at least 10 items", () => {
    const vegs = EXPIRY_KNOWLEDGE.filter((item) => item.category === "vegetable");
    expect(vegs.length).toBeGreaterThanOrEqual(10);
  });

  it("dairy category has at least 5 items", () => {
    const dairy = EXPIRY_KNOWLEDGE.filter((item) => item.category === "dairy");
    expect(dairy.length).toBeGreaterThanOrEqual(5);
  });

  it("meat category has at least 5 items", () => {
    const meat = EXPIRY_KNOWLEDGE.filter((item) => item.category === "meat");
    expect(meat.length).toBeGreaterThanOrEqual(5);
  });

  it("pantry category has at least 10 items", () => {
    const pantry = EXPIRY_KNOWLEDGE.filter((item) => item.category === "pantry");
    expect(pantry.length).toBeGreaterThanOrEqual(10);
  });
});
