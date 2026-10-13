import {
  normalizeNutrition,
  normalizeProduct,
  parseQuantity,
} from "@/supabase/functions/_shared/openFoodFacts";

describe("normalizeNutrition", () => {
  it("prefers per-serving values when the label gives a serving size", () => {
    expect(
      normalizeNutrition(
        {
          "energy-kcal_serving": 290.4,
          proteins_serving: 25,
          carbohydrates_serving: 18,
          fat_serving: 12.04,
          "energy-kcal_100g": 500,
        },
        " 1 bar (60 g) "
      )
    ).toEqual({ basis: "serving", serving_size: "1 bar (60 g)", kcal: 290, protein_g: 25, carbs_g: 18, fat_g: 12 });
  });

  it("falls back to per-100g when there is no per-serving energy", () => {
    expect(
      normalizeNutrition({ proteins_serving: 3, "energy-kcal_100g": 64, proteins_100g: 3.4, carbohydrates_100g: 4.8, fat_100g: 3.6 }, "250 ml")
    ).toEqual({ basis: "100g", serving_size: null, kcal: 64, protein_g: 3.4, carbs_g: 4.8, fat_g: 3.6 });
  });

  it("converts kJ-only energy to kcal", () => {
    expect(normalizeNutrition({ "energy-kj_100g": 418.4 }, undefined)?.kcal).toBe(100);
  });

  it("parses numeric strings and returns null when nothing is reported", () => {
    expect(normalizeNutrition({ "energy-kcal_100g": "120,5" }, undefined)?.kcal).toBe(121);
    expect(normalizeNutrition({}, "1 cup")).toBeNull();
    expect(normalizeNutrition(undefined, undefined)).toBeNull();
  });
});

describe("normalizeProduct", () => {
  it("maps name, brand, image, quantity and storage tip", () => {
    const result = normalizeProduct("0123456789012", {
      product_name: "Greek Yogurt",
      brands: "Fage, Total",
      quantity: "500 g",
      image_front_small_url: "http://images.openfoodfacts.org/x.jpg",
      conservation_conditions_en: "  Keep   refrigerated.\nConsume within 3 days of opening. ",
      nutriments: { "energy-kcal_100g": 97 },
    });
    expect(result).toMatchObject({
      barcode: "0123456789012",
      name: "Greek Yogurt",
      brand: "Fage",
      quantity: 500,
      unit: "g",
      image_url: "https://images.openfoodfacts.org/x.jpg",
      storage_tip: "Keep refrigerated. Consume within 3 days of opening.",
      notes: null,
    });
    expect(result.nutrition?.kcal).toBe(97);
  });

  it("prefers the English name and caps long storage text", () => {
    const result = normalizeProduct("12345678", {
      product_name: "Yaourt",
      product_name_en: "Yogurt",
      conservation_conditions: "x".repeat(800),
    });
    expect(result.name).toBe("Yogurt");
    expect(result.storage_tip).toHaveLength(500);
    expect(result.storage_tip?.endsWith("…")).toBe(true);
    expect(result.image_url).toBeNull();
  });
});

describe("parseQuantity", () => {
  it("splits a number and unit", () => {
    expect(parseQuantity("1,5 L")).toEqual({ quantity: 1.5, unit: "l" });
    expect(parseQuantity("6 x 330ml")).toEqual({ quantity: null, unit: "6 x 330ml" });
    expect(parseQuantity(undefined)).toEqual({ quantity: null, unit: null });
  });
});
