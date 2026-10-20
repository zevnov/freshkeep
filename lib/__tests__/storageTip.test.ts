import { storageFromTip } from "@/lib/storageTip";

describe("storageFromTip", () => {
  it("reads frozen, refrigerated and shelf-stable instructions", () => {
    expect(storageFromTip("Keep frozen at -18°C. Do not refreeze.", false)).toBe("freezer");
    expect(storageFromTip("Keep refrigerated.", false)).toBe("fridge");
    expect(storageFromTip("Store between 0°C and 4°C", false)).toBe("fridge");
    expect(storageFromTip("Store at 0-4°C", false)).toBe("fridge");
    expect(storageFromTip("Store in a cool, dry place away from sunlight.", false)).toBe("pantry");
  });

  it("keeps 'refrigerate after opening' products in the pantry until opened", () => {
    expect(storageFromTip("Refrigerate after opening and use within 6 weeks.", false)).toBe("pantry");
    expect(storageFromTip("Refrigerate after opening and use within 6 weeks.", true)).toBe("fridge");
    expect(storageFromTip("Store in a cool dry place. Once opened, keep refrigerated.", true)).toBe("fridge");
    expect(storageFromTip("Store in a cool dry place. Once opened, keep refrigerated.", false)).toBe("pantry");
  });

  it("treats an unconditional fridge instruction as fridge even when opening is mentioned", () => {
    expect(storageFromTip("Keep refrigerated below 5°C, once opened use within 3 days.", false)).toBe("fridge");
    expect(storageFromTip("Keep refrigerated. Refrigerate after opening and use within 2 days.", false)).toBe("fridge");
    expect(storageFromTip("After opening, refrigerate and consume within 3 days.", false)).toBe("pantry");
  });

  it("returns null when it cannot tell", () => {
    expect(storageFromTip("Best before: see lid.", false)).toBeNull();
    expect(storageFromTip(null, false)).toBeNull();
    expect(storageFromTip("", true)).toBeNull();
  });
});
