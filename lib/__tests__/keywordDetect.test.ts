import { detectItem, isNonPerishable, estimateExpiry } from "@/lib/keywordDetect";

describe("detectItem — exact name match", () => {
  it("finds strawberry by exact name", () => {
    const result = detectItem("strawberry");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("strawberry");
    expect(result!.category).toBe("fruit");
    expect(result!.fridgeDays).toBe(5);
    expect(result!.perishable).toBe(true);
  });

  it("finds broccoli by exact name", () => {
    const result = detectItem("broccoli");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("vegetable");
    expect(result!.fridgeDays).toBe(7);
  });

  it("finds milk by exact name", () => {
    const result = detectItem("milk");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("dairy");
  });
});

describe("detectItem — keyword (fuzzy) match", () => {
  it("matches 'strawberries' via keyword", () => {
    const result = detectItem("strawberries");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("strawberry");
  });

  it("matches 'brocolli' (misspelling) via keyword", () => {
    const result = detectItem("brocolli");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("broccoli");
  });

  it("matches 'organic strawberries' via keyword inclusion", () => {
    const result = detectItem("organic strawberries");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("strawberry");
  });
});

describe("detectItem — case insensitive", () => {
  it("matches uppercase input", () => {
    expect(detectItem("APPLE")).not.toBeNull();
    expect(detectItem("Apple")).not.toBeNull();
    expect(detectItem("apple")).not.toBeNull();
  });
});

describe("detectItem — no match", () => {
  it("returns null for unknown item", () => {
    expect(detectItem("xyznonexistentfood")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detectItem("")).toBeNull();
    expect(detectItem("  ")).toBeNull();
  });
});

describe("isNonPerishable", () => {
  it("returns false for perishable items (strawberry)", () => {
    const item = detectItem("strawberry")!;
    expect(isNonPerishable(item)).toBe(false);
  });

  it("returns true for non-perishable items (rice)", () => {
    const item = detectItem("rice");
    if (item) {
      expect(isNonPerishable(item)).toBe(true);
    }
  });
});

describe("estimateExpiry", () => {
  it("adds days to reference date", () => {
    const ref = new Date(2026, 4, 17); // May 17, 2026
    const result = estimateExpiry(ref, 5);
    expect(result.getDate()).toBe(22); // May 22
  });

  it("handles large day values", () => {
    const ref = new Date(2026, 4, 17);
    const result = estimateExpiry(ref, 365);
    expect(result.getFullYear()).toBe(2027);
  });
});
