import { calculateExpiry, suggestStorage } from "@/lib/expiryEngine";
import { detectItem, type DetectedItem } from "@/lib/keywordDetect";

// Fixed reference date for deterministic tests
const REF = new Date(2026, 0, 1); // Jan 1 2026

function datePlusDays(days: number): string {
  const d = new Date(REF);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("calculateExpiry — strawberry (fridgeDays=5, freezerDays=180)", () => {
  it("fridge, not opened → ~5 days, confidence=estimated", () => {
    const result = calculateExpiry("strawberry", "fridge", false, REF);
    expect(result.confidence).toBe("estimated");
    expect(result.spoilDate).toBe(datePlusDays(5));
    expect(result.message).toContain("5d");
    expect(result.matchedItem).not.toBeNull();
    expect(result.matchedItem!.name).toBe("strawberry");
  });

  it("freezer, not opened → ~180 days", () => {
    const result = calculateExpiry("strawberry", "freezer", false, REF);
    expect(result.confidence).toBe("estimated");
    expect(result.spoilDate).toBe(datePlusDays(180));
    expect(result.message).toContain("180d");
  });

  it("fridge, opened → halved days = 3 (Math.max(1, round(5/2)))", () => {
    // Math.round(2.5) === 3 in most JS engines
    const expected = Math.max(1, Math.round(5 / 2));
    const result = calculateExpiry("strawberry", "fridge", true, REF);
    expect(result.confidence).toBe("estimated");
    expect(result.spoilDate).toBe(datePlusDays(expected));
    expect(result.message).toContain("opened");
  });

  it("counter, not opened → perishable counter = round(5 * 0.4) = 2 days", () => {
    const expected = Math.round(5 * 0.4);
    const result = calculateExpiry("strawberry", "counter", false, REF);
    expect(result.confidence).toBe("estimated");
    expect(result.spoilDate).toBe(datePlusDays(expected));
    expect(result.message).toContain(`${expected}d`);
  });
});

describe("calculateExpiry — rice (non-perishable pantry item)", () => {
  it("pantry, not opened → 365 days", () => {
    const result = calculateExpiry("rice", "pantry", false, REF);
    expect(result.confidence).toBe("estimated");
    expect(result.spoilDate).toBe(datePlusDays(365));
    expect(result.message).toContain("365d");
  });
});

describe("calculateExpiry — unknown item", () => {
  it("unrecognised name → confidence=unknown, matchedItem=null, 7-day default", () => {
    const result = calculateExpiry("unknownitemxyz", "fridge", false, REF);
    expect(result.confidence).toBe("unknown");
    expect(result.matchedItem).toBeNull();
    expect(result.spoilDate).toBe(datePlusDays(7));
  });
});

describe("calculateExpiry — opened item with fridgeDays=2 (salmon)", () => {
  it("opened → Math.max(1, round(2/2)) = 1 day", () => {
    // salmon fridgeDays=2, opened → Math.max(1, Math.round(1)) = 1
    const result = calculateExpiry("salmon", "fridge", true, REF);
    expect(result.confidence).toBe("estimated");
    expect(result.spoilDate).toBe(datePlusDays(1));
    expect(result.message).toContain("opened");
  });
});

describe("suggestStorage", () => {
  it("perishable item → 'fridge'", () => {
    const item = detectItem("strawberry") as DetectedItem;
    expect(suggestStorage(item)).toBe("fridge");
  });

  it("non-perishable item → 'pantry'", () => {
    const item = detectItem("white rice") as DetectedItem;
    expect(suggestStorage(item)).toBe("pantry");
  });

  it("null → 'fridge'", () => {
    expect(suggestStorage(null)).toBe("fridge");
  });
});
