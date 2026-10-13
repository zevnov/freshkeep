import { normalizeUsername, parseBodyFatPercent, summarizeBodyFat, tenure, usernameError } from "@/lib/userProfile";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("usernames", () => {
  it("normalizes and validates", () => {
    expect(normalizeUsername("  @Sam_K ")).toBe("sam_k");
    expect(usernameError("sam_k")).toBeNull();
    expect(usernameError("")).toBeNull();
    expect(usernameError("ab")).not.toBeNull();
    expect(usernameError("sam.k")).not.toBeNull();
  });
});

describe("parseBodyFatPercent", () => {
  it("accepts plausible values with either decimal mark", () => {
    expect(parseBodyFatPercent("18")).toBe(18);
    expect(parseBodyFatPercent("18,46")).toBe(18.5);
  });

  it("rejects empty, non-numeric and implausible values", () => {
    expect(parseBodyFatPercent("")).toBeNull();
    expect(parseBodyFatPercent("abc")).toBeNull();
    expect(parseBodyFatPercent("1")).toBeNull();
    expect(parseBodyFatPercent("85")).toBeNull();
  });
});

describe("summarizeBodyFat", () => {
  it("returns null without entries", () => {
    expect(summarizeBodyFat([])).toBeNull();
  });

  it("has no changes with a single reading", () => {
    const s = summarizeBodyFat([{ id: "a", recorded_on: "2026-05-01", percent: 20 }]);
    expect(s).toMatchObject({ sincePrevious: null, sinceFirst: null, latest: { percent: 20 } });
  });

  it("computes changes regardless of input order", () => {
    const s = summarizeBodyFat([
      { id: "b", recorded_on: "2026-06-01", percent: 19.1 },
      { id: "c", recorded_on: "2026-07-01", percent: 18.4 },
      { id: "a", recorded_on: "2026-05-01", percent: 20.2 },
    ]);
    expect(s?.latest.id).toBe("c");
    expect(s?.first.id).toBe("a");
    expect(s?.sincePrevious).toBe(-0.7);
    expect(s?.sinceFirst).toBe(-1.8);
  });
});

describe("tenure", () => {
  const now = new Date(2026, 9, 12, 12);

  it("counts days for the first month", () => {
    expect(tenure(new Date(2026, 9, 12, 8).toISOString(), now)).toEqual({ days: 0, label: "Joined today" });
    expect(tenure(new Date(2026, 9, 11, 8).toISOString(), now)).toEqual({ days: 1, label: "1 day" });
    expect(tenure(new Date(2026, 8, 20, 12).toISOString(), now).label).toBe("22 days");
  });

  it("uses years and months after that", () => {
    expect(tenure(new Date(2026, 7, 12, 12).toISOString(), now).label).toBe("2 months");
    expect(tenure(new Date(2025, 8, 1, 12).toISOString(), now).label).toBe("1 year, 1 month");
    expect(tenure(new Date(2024, 9, 12, 12).toISOString(), now).label).toBe("2 years");
  });
});
