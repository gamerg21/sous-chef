import assert from "node:assert/strict";
import test from "node:test";

import { inferShoppingCategory, mapOpenFoodFactsProduct } from "../src/lib/open-food-facts/mapper";
import { toBarcodeLookupFacts } from "../src/lib/open-food-facts/facts";

test("mapOpenFoodFactsProduct maps core fields and nutrition", () => {
  const payload = mapOpenFoodFactsProduct(
    "1234567890123",
    {
      product_name: "Greek Yogurt",
      product_name_en: "Greek Yogurt",
      brands: "Acme",
      categories_tags: ["en:dairy-products", "en:yogurts"],
      allergens_tags: ["en:milk"],
      ingredients_text: "cultured milk",
      nutriscore_grade: "b",
      nova_group: 3,
      ecoscore_grade: "c",
      image_front_url: "https://example.com/front.jpg",
      nutriments: {
        "energy-kcal_100g": 120,
        fat_100g: 5,
        carbohydrates_100g: 6,
        sugars_100g: 4,
        proteins_100g: 10,
        salt_100g: 0.2,
      },
    },
    "https://world.openfoodfacts.org"
  );

  assert.equal(payload.name, "Greek Yogurt");
  assert.equal(payload.brand, "Acme");
  assert.deepEqual(payload.categoriesTags, ["en:dairy-products", "en:yogurts"]);
  assert.deepEqual(payload.allergensTags, ["en:milk"]);
  assert.equal(payload.nutriscoreGrade, "b");
  assert.equal(payload.novaGroup, 3);
  assert.equal(payload.ecoscoreGrade, "c");
  assert.equal(payload.nutritionPer100g?.proteinG, 10);
  assert.equal(
    payload.attributionUrl,
    "https://world.openfoodfacts.org/product/1234567890123"
  );
});

test("inferShoppingCategory maps known category tags", () => {
  assert.equal(inferShoppingCategory(["en:dairy-products"]), "Dairy");
  assert.equal(inferShoppingCategory(["en:frozen-foods"]), "Frozen");
  assert.equal(inferShoppingCategory(["en:breakfast-cereals"]), "Pantry");
});

test("toBarcodeLookupFacts returns undefined for empty facts", () => {
  const facts = toBarcodeLookupFacts({
    brand: null,
    categoriesTags: [],
    ingredientsText: null,
    allergensTags: [],
    nutriscoreGrade: null,
    novaGroup: null,
    ecoscoreGrade: null,
    imageFrontUrl: null,
    nutritionPer100g: null,
  });

  assert.equal(facts, undefined);
});
