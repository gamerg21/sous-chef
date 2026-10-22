import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  importDefaults,
  inferCategory,
  measures,
  packageChoices,
  parsePackage,
  parseProduct,
  productBadges,
  suggestStorage,
} from '../src/lib/food-product';

// Real Open Food Facts records (ODbL), trimmed to the fields Sous Chef asks for.
const product = (code: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/open-food-facts/${code}.json`, import.meta.url), 'utf8')).product;

describe('Open Food Facts products', () => {
  test('a 12-pack counts as cans, with the size of each', () => {
    const parsed = parseProduct(product('049000028911'))!;
    expect(parsed.facts.packaging).toMatchObject({ count: 12, container: 'can', amount: 144, unit: 'fl oz', eachAmount: 12, eachUnit: 'fl oz' });
    expect(packageChoices(parsed.facts.packaging)).toEqual([{ quantity: 12, unit: 'can' }, { quantity: 144, unit: 'fl oz' }]);
    expect(parsed.facts.nutritionBasis).toBe('100ml');
    expect(parsed.category).toBe('Beverages');
  });

  test('a box keeps the size printed on it and works out its servings', () => {
    const parsed = parseProduct(product('016000275287'))!;
    expect(parsed.facts.packaging).toMatchObject({ text: '18 oz (510 g)', amount: 18, unit: 'oz', netQuantity: 510, netUnit: 'g', container: 'box' });
    expect(parsed.facts.serving).toEqual({ text: '39g', amount: 39, unit: 'g', perPackage: 13 });
    expect(parsed.facts.nutritionPerServing).toMatchObject({ energyKcal: 140, proteinG: 5 });
    expect(packageChoices(parsed.facts.packaging)).toEqual([{ quantity: 18, unit: 'oz' }, { quantity: 1, unit: 'box' }]);
    expect(parsed.category).toBe('Grains & Rice');
  });

  test('the printed serving wins over a mislabeled unit', () => {
    const parsed = parseProduct(product('041196910759'))!;
    expect(parsed.facts.serving).toMatchObject({ amount: 249, unit: 'g', perPackage: 2 });
    expect(parsed.facts.packaging).toMatchObject({ amount: 18.5, unit: 'oz', container: 'can' });
    expect(parsed.category).toBe('Canned Goods');
    expect(parsed.facts.storage).toBe('pantry');
  });

  test('packaging records that contradict the net contents are ignored', () => {
    // Nutella's record lists six 25 cl bottles for a 400 g jar.
    const parsed = parseProduct(product('3017620422003'))!;
    expect(parsed.facts.packaging).toEqual({ text: '400 g e', amount: 400, unit: 'g', netQuantity: 400, netUnit: 'g' });
    expect(parsed.facts.storage).toBe('pantry');
    expect(parsed.category).toBe('Pantry');
  });

  test('a package smaller than one serving is treated as a typo', () => {
    const parsed = parseProduct(product('5000159484695'))!;
    expect(parsed.facts.packaging).toEqual({ text: '1 gram' });
    expect(packageChoices(parsed.facts.packaging)).toEqual([]);
    expect(parsed.facts.storage).toBe('freezer');
    expect(parsed.category).toBe('Frozen');
  });

  test('frozen and chilled foods suggest the freezer and fridge', () => {
    expect(parseProduct(product('0013800047199'))!.facts.storage).toBe('freezer');
    expect(parseProduct(product('0894700010137'))!.facts.storage).toBe('fridge');
    expect(parseProduct(product('0894700010137'))!.category).toBe('Dairy');
  });

  test('counted packages without a weight still count', () => {
    const parsed = parseProduct(product('0655122201745'))!;
    expect(parsed.facts.packaging).toMatchObject({ count: 2, container: 'each' });
    expect(packageChoices(parsed.facts.packaging)).toEqual([{ quantity: 2, unit: 'each' }]);
  });

  test('dietary labels become short badges', () => {
    expect(productBadges(parseProduct(product('0096619483556'))!.facts)).toEqual(['Vegetarian', 'Organic', 'Gluten-free', 'Kosher', 'Palm oil free']);
    expect(productBadges(parseProduct(product('096619756803'))!.facts)).toEqual(['Vegan', 'Palm oil free']);
  });

  test('products without a size still bring their nutrition', () => {
    const parsed = parseProduct(product('0011110038364'))!;
    expect(parsed.facts.packaging).toBeUndefined();
    expect(parsed.facts.nutritionPer100g).toMatchObject({ energyKcal: 333.3 });
  });
});

describe('product parsing details', () => {
  test('reads label measures, decimal commas and centiliters', () => {
    expect(measures('18 oz (510 g)').map((m) => [m.amount, m.unit])).toEqual([[18, 'oz'], [510, 'g']]);
    expect(measures('1,5 l').map((m) => m.amount)).toEqual([1.5]);
    expect(measures('33 cl').map((m) => [m.amount, m.unit])).toEqual([[330, 'ml']]);
    expect(measures('1,500 g').map((m) => m.amount)).toEqual([1500]);
  });

  test('reads multipacks written either way round', () => {
    expect(parsePackage({ quantity: '6 x 330 ml', product_quantity: 1980, product_quantity_unit: 'ml' }))
      .toMatchObject({ count: 6, amount: 1980, unit: 'ml', eachAmount: 330, eachUnit: 'ml' });
    expect(parsePackage({ quantity: '12 fl oz x 12' })).toMatchObject({ count: 12, amount: 144, unit: 'fl oz' });
    expect(parsePackage({ quantity: '8 bottles', serving_size: '1 bottle (500 ml)' })).toMatchObject({ count: 8, container: 'bottle' });
  });

  test('US drinks in ounces mean fluid ounces', () => {
    expect(parsePackage({ quantity: '12 oz', product_quantity: 355, product_quantity_unit: 'ml' })).toMatchObject({ amount: 12, unit: 'fl oz' });
  });

  test('falls back to the normalized net contents', () => {
    expect(parsePackage({ product_quantity: 1500, product_quantity_unit: 'g' })).toMatchObject({ amount: 1.5, unit: 'kg' });
  });

  test('works out nutrition from kilojoules, sodium or a serving', () => {
    const parsed = parseProduct({
      product_name: 'Test',
      serving_size: '50 g',
      serving_quantity: 50,
      nutriments: { energy_serving: 418.4, sodium_serving: 0.2, proteins_serving: 5 },
    })!;
    expect(parsed.facts.nutritionPerServing).toEqual({ energyKcal: 100, proteinG: 5, saltG: 0.5 });
    expect(parsed.facts.nutritionPer100g).toEqual({ energyKcal: 200, proteinG: 10, saltG: 1 });
  });

  test('cleans names printed in capitals or with their size', () => {
    expect(parseProduct({ product_name: 'DIET COKE' })!.name).toBe('Diet Coke');
    expect(parseProduct({ product_name: 'Spaghetti - 500 g' })!.name).toBe('Spaghetti');
    expect(parseProduct({ generic_name: 'Oat drink' })!.name).toBe('Oat drink');
    expect(parseProduct({ brands: 'No name' })).toBeUndefined();
  });

  test('storage reads instructions, ignoring what happens after opening', () => {
    expect(suggestStorage('Keep refrigerated. Once opened, use within 3 days.', undefined)).toBe('fridge');
    expect(suggestStorage('Store in a cool, dry place. Refrigerate after opening.', undefined)).toBe('pantry');
    expect(suggestStorage('Do not refrigerate.', ['en:spreads'])).toBe('pantry');
    expect(suggestStorage(undefined, ['en:dairies', 'en:cheeses'])).toBe('fridge');
    expect(suggestStorage(undefined, ['en:dairies', 'en:uht-milks'])).toBe('pantry');
    expect(suggestStorage(undefined, undefined)).toBeUndefined();
  });

  test('category comes from the most specific tag', () => {
    expect(inferCategory(['en:dairies', 'en:cheeses'])).toBe('Dairy');
    expect(inferCategory(['en:plant-based-foods-and-beverages', 'en:spreads', 'en:peanut-butters'])).toBe('Pantry');
    expect(inferCategory(['en:plant-based-foods-and-beverages', 'en:fruits-based-foods', 'en:fruit-juices'])).toBe('Beverages');
    expect(inferCategory(['en:frozen-foods', 'en:frozen-vegetables', 'en:peas'])).toBe('Frozen');
    expect(inferCategory(['en:meats', 'en:steaks'])).toBe('Meat & Seafood');
    expect(inferCategory(['en:unknown'])).toBe('Other');
    expect(inferCategory([])).toBeUndefined();
  });

  test('a scan reuses how the kitchen counted the product last time', () => {
    const facts = parseProduct(product('049000028911'))!.facts;
    expect(importDefaults(facts)).toEqual({ quantity: 12, unit: 'can', location: 'pantry' });
    expect(importDefaults(facts, 'fl oz')).toEqual({ quantity: 144, unit: 'fl oz', location: 'pantry' });
    expect(importDefaults(facts, 'slice')).toEqual({ quantity: 12, unit: 'can', location: 'pantry' });
  });
});
