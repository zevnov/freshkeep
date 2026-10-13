import {
  activityMessage,
  groupActivity,
  listNames,
  recallMessage,
  wantsPush,
} from "@/supabase/functions/_shared/notificationMessages";
import { extractGtins, hasValidCheckDigit, normalizeFdaReport, toGtin14 } from "@/supabase/functions/_shared/recalls";

describe("activity messages", () => {
  it("lists names compactly", () => {
    expect(listNames([])).toBe("an item");
    expect(listNames(["Milk"])).toBe("Milk");
    expect(listNames(["Milk", "Eggs"])).toBe("Milk and Eggs");
    expect(listNames(["Milk", "Eggs", "Bread"])).toBe("Milk, Eggs and Bread");
    expect(listNames(["Milk", "Eggs", "Bread", "Jam", "Tea"])).toBe("Milk, Eggs and 3 more");
    expect(listNames(["Milk", "Milk "])).toBe("Milk");
  });

  it("says who did what", () => {
    expect(activityMessage("Sam", "added", ["Milk"])).toBe("Sam added Milk");
    expect(activityMessage("Sam", "used", ["Milk", "Eggs"])).toBe("Sam used up Milk and Eggs");
    expect(activityMessage("Sam", "tossed", ["Spinach"])).toBe("Sam tossed Spinach");
  });

  it("groups by household, actor and action", () => {
    const groups = groupActivity([
      { id: 1, household_id: "h", actor_id: "a", action: "added", item_name: "Milk" },
      { id: 2, household_id: "h", actor_id: "a", action: "added", item_name: "Eggs" },
      { id: 3, household_id: "h", actor_id: "a", action: "used", item_name: "Jam" },
      { id: 4, household_id: "h", actor_id: "b", action: "added", item_name: "Tea" },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ household_id: "h", actor_id: "a", action: "added", ids: [1, 2], names: ["Milk", "Eggs"] });
  });
});

describe("push preferences", () => {
  it("treats only an explicit false as opted out", () => {
    expect(wantsPush({}, "notifyRecalls")).toBe(true);
    expect(wantsPush(null, "notifyRecalls")).toBe(true);
    expect(wantsPush({ notifyRecalls: false }, "notifyRecalls")).toBe(false);
    expect(wantsPush({ notifyRecalls: false }, "notifyHouseholdActivity")).toBe(true);
  });
});

describe("recallMessage", () => {
  it("names the item and trims long reasons", () => {
    const m = recallMessage("Peanut butter", "Potential Salmonella contamination. ".repeat(10));
    expect(m.title).toBe("Recall: Peanut butter");
    expect(m.body.length).toBeLessThan(200);
    expect(recallMessage("Milk", null).body).toContain("Tap for details");
  });
});

describe("barcodes in recall text", () => {
  it("validates GS1 check digits", () => {
    expect(hasValidCheckDigit("036000291452")).toBe(true);
    expect(hasValidCheckDigit("036000291453")).toBe(false);
    expect(hasValidCheckDigit("4006381333931")).toBe(true);
  });

  it("finds UPCs however they are spaced, and ignores lot numbers", () => {
    expect(extractGtins("Peanut Butter 16 oz, UPC 0 36000 29145 2; Lot 123456789013")).toEqual([toGtin14("036000291452")]);
    expect(extractGtins("UPC: 036000-291452", "EAN 4006381333931")).toEqual(["00036000291452", "04006381333931"]);
    expect(extractGtins(undefined, "no codes here")).toEqual([]);
    expect(extractGtins("UPC 041220577668 041220577675")).toEqual(["00041220577668", "00041220577675"]);
    expect(extractGtins("Lot 1234 036000291452")).toEqual(["00036000291452"]);
  });

  it("normalizes an FDA report", () => {
    const row = normalizeFdaReport({
      recall_number: "F-1234-2026",
      product_description: "Creamy Peanut Butter, 16 oz jar, UPC 036000291452",
      reason_for_recall: "Potential Salmonella",
      recalling_firm: "Acme Foods",
      classification: "Class I",
      status: "Ongoing",
      report_date: "20261001",
      code_info: "Best by 2027",
    });
    expect(row).toMatchObject({
      recall_number: "F-1234-2026",
      report_date: "2026-10-01",
      gtins: ["00036000291452"],
      reason: "Potential Salmonella",
    });
    expect(normalizeFdaReport({ recall_number: "F-1" })).toBeNull();
  });
});
