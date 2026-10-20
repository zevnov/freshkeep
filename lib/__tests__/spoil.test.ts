import {
  addDaysLocal,
  computeFreshnessBand,
  daysUntilSpoil,
  parseLocalDate,
  spoilOnFromShelf,
  toLocalDateString,
} from "@/lib/spoil";

describe("toLocalDateString / parse round-trip", () => {
  it("formats local calendar date", () => {
    const d = new Date(2026, 3, 4);
    expect(toLocalDateString(d)).toBe("2026-04-04");
  });

  it("parses a valid leap day", () => {
    expect(toLocalDateString(parseLocalDate("2024-02-29"))).toBe("2024-02-29");
  });

  it("rejects an invalid month", () => {
    expect(() => parseLocalDate("2026-13-15")).toThrow(RangeError);
  });

  it("rejects day zero", () => {
    expect(() => parseLocalDate("2026-04-00")).toThrow(RangeError);
  });

  it("rejects impossible calendar days", () => {
    expect(() => parseLocalDate("2026-02-30")).toThrow(RangeError);
  });

  it("rejects non-leap-year february 29", () => {
    expect(() => parseLocalDate("2025-02-29")).toThrow(RangeError);
  });
});

describe("computeFreshnessBand", () => {
  const spoil = "2026-04-10";
  const soonDays = 3;

  it("returns overdue after spoil date", () => {
    expect(computeFreshnessBand(spoil, soonDays, "2026-04-11")).toBe("overdue");
  });

  it("returns today on spoil date", () => {
    expect(computeFreshnessBand(spoil, soonDays, "2026-04-10")).toBe("today");
  });

  it("returns soon inside window", () => {
    expect(computeFreshnessBand(spoil, soonDays, "2026-04-08")).toBe("soon");
  });

  it("returns fresh before soon window", () => {
    expect(computeFreshnessBand(spoil, soonDays, "2026-04-05")).toBe("fresh");
  });

  it("uses at least 1 day for soon window", () => {
    expect(computeFreshnessBand(spoil, 0, "2026-04-09")).toBe("soon");
  });
});

describe("addDaysLocal / spoilOnFromShelf / daysUntilSpoil", () => {
  it("adds days in local calendar", () => {
    expect(addDaysLocal("2026-04-01", 5)).toBe("2026-04-06");
  });

  it("computes spoil from shelf life", () => {
    expect(spoilOnFromShelf("2026-04-01", 7)).toBe("2026-04-08");
  });

  it("counts days until spoil", () => {
    expect(daysUntilSpoil("2026-04-10", "2026-04-04")).toBe(6);
  });
});
