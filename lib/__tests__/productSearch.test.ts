import { recentProducts } from "@/lib/productSearch";
import { makeItem } from "./itemFixture";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("recentProducts", () => {
  it("returns barcoded items newest first, one per barcode", () => {
    const items = [
      makeItem({ id: "1", name: "Old milk", spoil_on: "2026-01-01", barcode: "11111111", created_at: "2026-01-01T00:00:00Z" }),
      makeItem({ id: "2", name: "Bananas", spoil_on: "2026-01-01", created_at: "2026-03-01T00:00:00Z" }),
      makeItem({ id: "3", name: "New milk", spoil_on: "2026-01-01", barcode: "11111111", created_at: "2026-02-01T00:00:00Z" }),
      makeItem({ id: "4", name: "Yogurt", spoil_on: "2026-01-01", barcode: "22222222", brand: "Fage", created_at: "2026-01-15T00:00:00Z" }),
    ];
    const recent = recentProducts(items);
    expect(recent.map((p) => p.name)).toEqual(["New milk", "Yogurt"]);
    expect(recent[1]).toMatchObject({ barcode: "22222222", brand: "Fage", notes: null });
  });

  it("respects the limit", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem({ id: String(i), name: `P${i}`, spoil_on: "2026-01-01", barcode: `1000000${i}`, created_at: `2026-01-0${i + 1}` })
    );
    expect(recentProducts(items, 2).map((p) => p.name)).toEqual(["P4", "P3"]);
  });
});
