import { parseRecallAlert } from "@/lib/recalls";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@sentry/react-native", () => ({ captureMessage: jest.fn() }));

describe("parseRecallAlert", () => {
  it("flattens the joined recall (object or one-element array)", () => {
    const base = { id: "a1", item_id: "i1", recall_number: "F-1-2026" };
    const recall = { product_description: "Peanut butter", reason: "Salmonella", url: "https://x" };
    expect(parseRecallAlert({ ...base, product_recalls: recall })).toMatchObject({
      id: "a1",
      item_id: "i1",
      product_description: "Peanut butter",
      reason: "Salmonella",
      recalling_firm: null,
    });
    expect(parseRecallAlert({ ...base, product_recalls: [recall] })?.reason).toBe("Salmonella");
  });

  it("rejects rows missing ids or the recall", () => {
    expect(parseRecallAlert({ id: "a1", item_id: "i1", recall_number: "F" })).toBeNull();
    expect(parseRecallAlert(null)).toBeNull();
  });
});
