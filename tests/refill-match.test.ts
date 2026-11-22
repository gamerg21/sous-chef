import { describe, expect, test } from 'vitest';
import { findRefill, refillUpdate, type RefillItem } from '../src/lib/refill-match';

let next = 0;
const stock = (name: string, quantity: number, extra: Partial<RefillItem> = {}): RefillItem => ({ id: `item-${++next}`, name, quantity, unit: 'l', ...extra });

describe('finding the item to refill', () => {
  test('the same barcode or the same name is a strong match', () => {
    const milk = stock('Milk', 0, { barcode: '111' });
    expect(findRefill({ name: 'Something else', barcode: '111' }, [milk])).toEqual({ item: milk, confidence: 'strong', out: true, defaultOn: true });
    expect(findRefill({ name: ' MILK ' }, [milk])).toMatchObject({ item: milk, confidence: 'strong' });
    const tomatoes = stock('Cherry tomatoes', 0);
    expect(findRefill({ name: 'cherry-tomato' }, [tomatoes])).toMatchObject({ item: tomatoes, confidence: 'strong' });
    // Salt, pepper and water are matched like anything else.
    const salt = stock('Salt', 0);
    expect(findRefill({ name: 'salt' }, [salt])).toMatchObject({ item: salt, confidence: 'strong' });
    expect(findRefill({ name: '' }, [milk])).toBeUndefined();
    expect(findRefill({ name: '…' }, [stock('!!', 0)])).toBeUndefined();
  });

  test('a brand at the start or end of the scanned name is ignored', () => {
    const milk = stock('Milk', 0);
    expect(findRefill({ name: 'Fairlife Milk', brand: 'Fairlife, The Coca-Cola Company' }, [milk])).toMatchObject({ item: milk, confidence: 'strong' });
    expect(findRefill({ name: 'Milk - Horizon', brand: 'Horizon' }, [milk])).toMatchObject({ item: milk, confidence: 'strong' });
    // A brand that is the whole name is the name.
    const oreo = stock('Oreo', 0);
    expect(findRefill({ name: 'Oreo', brand: 'Oreo' }, [oreo])).toMatchObject({ item: oreo, confidence: 'strong' });
    // The existing item's own brand is ignored the same way.
    const branded = stock('Horizon Milk', 0, { foodFacts: { brand: 'Horizon' } });
    expect(findRefill({ name: 'Milk' }, [branded])).toMatchObject({ item: branded, confidence: 'strong' });
  });

  test('qualifiers make a weak match, in either direction', () => {
    const milk = stock('Milk', 0);
    expect(findRefill({ name: 'Organic Whole Milk' }, [milk])).toEqual({ item: milk, confidence: 'weak', out: true, defaultOn: false });
    expect(findRefill({ name: '2% Low-Fat Milk' }, [milk])).toMatchObject({ confidence: 'weak' });
    const whole = stock('Whole milk', 0);
    expect(findRefill({ name: 'Milk' }, [whole])).toMatchObject({ item: whole, confidence: 'weak' });
    // An unknown extra word, such as a brand the lookup didn't name, still matches weakly.
    expect(findRefill({ name: 'Kirkland Milk' }, [milk])).toMatchObject({ confidence: 'weak' });
  });

  test('extra words that name another food give no match', () => {
    const milk = stock('Milk', 0);
    for (const name of ['Oat milk', 'Almond Milk', 'Soy milk', 'Coconut milk', 'Chocolate milk', 'Goat milk', 'Milk chocolate', 'Evaporated milk']) expect([name, findRefill({ name }, [milk])]).toEqual([name, undefined]);
    expect(findRefill({ name: 'Milk' }, [stock('Oat milk', 0)])).toBeUndefined();
    expect(findRefill({ name: 'Chicken' }, [stock('Chicken broth', 0)])).toBeUndefined();
    expect(findRefill({ name: 'Peanut butter' }, [stock('Butter', 0)])).toBeUndefined();
    expect(findRefill({ name: 'Rice' }, [milk])).toBeUndefined();
  });

  test('weak matches that are different foods give no match', () => {
    expect(findRefill({ name: 'Bread' }, [stock('Rye bread', 0), stock('Banana bread', 0)])).toBeUndefined();
    // Two rows of the same food are not ambiguous.
    const older = stock('Whole milk', 0, { createdAt: 1 });
    const newer = stock('Organic milk', 0, { createdAt: 2 });
    expect(findRefill({ name: 'Fresh Milk' }, [older, newer])).toMatchObject({ item: newer, confidence: 'weak' });
    // A strong match settles it.
    const bread = stock('Bread', 0);
    expect(findRefill({ name: 'Bread' }, [stock('Rye bread', 0), stock('Banana bread', 0), bread])).toMatchObject({ item: bread, confidence: 'strong' });
  });

  test('out items come first, then the newest', () => {
    const inStock = stock('Milk', 2, { createdAt: 30 });
    const outOld = stock('Milk', 0, { createdAt: 10 });
    const outNew = stock('milk', 0, { createdAt: 20 });
    expect(findRefill({ name: 'Milk', unit: 'l' }, [inStock, outOld, outNew])).toMatchObject({ item: outNew, out: true, defaultOn: true });
    const newerInStock = stock('Milk', 1, { createdAt: 40 });
    expect(findRefill({ name: 'Milk', unit: 'L' }, [inStock, newerInStock])).toEqual({ item: newerInStock, confidence: 'strong', out: false, defaultOn: false });
  });

  test('an item in stock is offered only on a strong match in the same unit', () => {
    const milk = stock('Milk', 2);
    expect(findRefill({ name: 'Milk', unit: 'l' }, [milk])).toMatchObject({ item: milk, out: false, defaultOn: false });
    expect(findRefill({ name: 'Milk', unit: 'gal' }, [milk])).toBeUndefined();
    expect(findRefill({ name: 'Organic Milk', unit: 'l' }, [milk])).toBeUndefined();
    // Out: the unit comes from the new purchase.
    expect(findRefill({ name: 'Milk', unit: 'gal' }, [stock('Milk', 0)])).toMatchObject({ confidence: 'strong', defaultOn: true });
  });
});

describe('the update that refills an item', () => {
  const form = { quantity: 2, unit: 'gal', locationId: 'fridge', expiresOn: '2026-12-01', category: 'Dairy', notes: 'On sale', barcode: '222', nutritionPer100g: { energyKcal: 64 } };

  test('an item that is out takes the purchase and keeps its name', () => {
    expect(refillUpdate({ id: 'a', quantity: 0 }, form)).toEqual({ id: 'a', ...form });
    // Blanks leave what the item had.
    expect(refillUpdate({ id: 'a', quantity: 0, barcode: '111' }, { quantity: 1, unit: 'l', locationId: 'pantry', expiresOn: '', category: '', notes: ' ', barcode: '', nutritionPer100g: null }))
      .toEqual({ id: 'a', quantity: 1, unit: 'l', locationId: 'pantry' });
  });

  test('an item in stock gains the amount and keeps its own date and barcode', () => {
    expect(refillUpdate({ id: 'a', quantity: 1, expiresOn: '2026-11-30', barcode: '111' }, form)).toEqual({ id: 'a', quantityDelta: 2 });
    expect(refillUpdate({ id: 'a', quantity: 1 }, form)).toEqual({ id: 'a', quantityDelta: 2, expiresOn: '2026-12-01', barcode: '222' });
    expect(refillUpdate({ id: 'a', quantity: 1, expiresOn: '2026-11-30', barcode: '111' }, { ...form, locationChosen: true })).toEqual({ id: 'a', quantityDelta: 2, locationId: 'fridge' });
  });
});
