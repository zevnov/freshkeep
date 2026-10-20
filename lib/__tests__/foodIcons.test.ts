import { CATEGORY_ICONS, DEFAULT_ICON, ICON_CHOICES, itemIcon, suggestIcon } from "@/lib/foodIcons";
import { EXPIRY_KNOWLEDGE } from "@/lib/expiryKnowledge";

describe("suggestIcon", () => {
  it("uses a specific food icon, then a food family, then the category", () => {
    expect(suggestIcon("Bananas")).toBe("🍌");
    expect(suggestIcon("Tillamook cheddar cheese")).toBe("🧀");
    expect(suggestIcon("rice wine")).toBe("🍷");
    expect(suggestIcon("brown rice")).toBe("🍚");
    expect(suggestIcon("chicken thighs")).toBe(CATEGORY_ICONS.poultry);
  });

  it("falls back to the stored category, then a cart", () => {
    expect(suggestIcon("Mystery jar", "sauce")).toBe(CATEGORY_ICONS.sauce);
    expect(suggestIcon("Mystery jar")).toBe(DEFAULT_ICON);
  });
});

describe("itemIcon", () => {
  it("prefers the icon the user picked", () => {
    expect(itemIcon({ icon: "🎂", name: "Bananas", category: "fruit" })).toBe("🎂");
    expect(itemIcon({ icon: null, name: "Bananas", category: "fruit" })).toBe("🍌");
  });
});

describe("icon tables", () => {
  it("cover every knowledge-base category", () => {
    const categories = new Set(EXPIRY_KNOWLEDGE.map((i) => i.category));
    for (const c of categories) expect(CATEGORY_ICONS[c]).toBeDefined();
  });

  it("offer each picker icon once", () => {
    expect(new Set(ICON_CHOICES).size).toBe(ICON_CHOICES.length);
  });
});
