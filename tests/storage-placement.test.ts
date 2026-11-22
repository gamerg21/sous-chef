import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { foodStem, foodWords, locationKind, locationOfKind, matchPlacement, suggestPlacement } from '../src/lib/storage-placement';
import { INVENTORY_CATEGORY_OPTIONS } from '../src/components/inventory/types';

describe('storage placement', () => {
  test('names go where that food is kept', () => {
    const cases: Array<[string, string | undefined]> = [
      ['milk', 'fridge'], ['Organic Whole Milk', 'fridge'], ['UHT milk', 'pantry'], ['evaporated milk', 'pantry'],
      ['coconut milk', 'pantry'], ['peanut butter', 'pantry'], ['butter', 'fridge'], ['ice cream', 'freezer'],
      ['frozen peas', 'freezer'], ['eggs', 'fridge'], ['egg noodles', 'pantry'], ['chicken broth', 'pantry'],
      ['chicken breast', 'fridge'], ['rice', 'pantry'], ['potatoes', 'pantry'], ['spinach', 'fridge'],
      ['Chocolate milk', 'fridge'], ['spring mix', 'fridge'], ['chicken soup', 'pantry'], ['mint tea', 'pantry'],
      ['zzgrobnik', undefined], ['', undefined],
    ];
    for (const [name, place] of cases) expect([name, suggestPlacement(name)]).toEqual([name, place]);
  });

  test('the freezer wins, then shelf-stable wording, then the fridge', () => {
    for (const name of ['Ice', 'Frozen Pizza', 'frozen waffles', 'Tater Tots', 'fish sticks', 'Popsicles', 'ice cubes', 'Mango sorbet']) expect([name, suggestPlacement(name)]).toEqual([name, 'freezer']);
    for (const name of ['Canned tuna', 'can of beans', 'Dried apricots', 'powdered milk', 'Condensed Milk', 'Shelf-stable almond milk', 'long-life cream', 'Beef jerky', 'Almond butter', 'Milk chocolate', 'Cream of tartar', 'Cream of mushroom soup', 'Beef stock', 'Fish sauce', 'Tomato paste', 'Cheese crackers', 'Sour cream & onion chips', 'Pancake mix', 'Olive oil', 'Ghee']) expect([name, suggestPlacement(name)]).toEqual([name, 'pantry']);
    for (const name of ['Half-and-half', 'Greek yoghurt', 'Cream cheese', 'Ground beef', 'Crème fraîche cream', 'Strawberries', 'Bell peppers', 'Green beans', 'Green onions', 'Corn on the cob', 'Orange juice', 'Fresh pasta', 'Mixed greens', 'Leftovers']) expect([name, suggestPlacement(name)]).toEqual([name, 'fridge']);
    for (const name of ['Sweet potatoes', 'Black pepper', 'Soy sauce', 'Garlic', 'Green tea', 'Bananas', 'Baking powder', 'Butternut squash', 'Oats']) expect([name, suggestPlacement(name)]).toEqual([name, 'pantry']);
  });

  test('words match whole, not inside other words', () => {
    expect(matchPlacement('Eggplant')?.reason).toBe('eggplant');
    expect(matchPlacement('Grapefruit')?.reason).toBe('grapefruit');
    expect(matchPlacement('Iceberg')?.reason).toBe('iceberg');
    expect(suggestPlacement('Ice melt')).toBeUndefined();
  });

  test('the food is the last thing named, and the longer phrase wins a tie', () => {
    const cases: Array<[string, string]> = [
      ['Chicken noodle soup', 'pantry'], ['Hot dog buns', 'pantry'], ['Hamburger buns', 'pantry'], ['Hot dogs', 'fridge'],
      ['Tuna in water', 'pantry'], ['Yogurt with granola', 'fridge'], ['Tuna steak', 'fridge'],
      ['Macaroni and cheese', 'pantry'], ['Cheddar', 'fridge'], ['Ice cream cones', 'pantry'],
      ['Peppers', 'fridge'], ['Mints', 'pantry'], ['Fresh ginger', 'fridge'], ['Ground ginger', 'pantry'],
      ['Apple cider vinegar', 'pantry'], ['Cookie dough', 'fridge'], ['Salmon fillet (frozen)', 'freezer'],
      ['Sparkling water', 'pantry'], ['Dog food', 'pantry'], ['Egg rolls', 'freezer'],
    ];
    for (const [name, place] of cases) expect([name, suggestPlacement(name)]).toEqual([name, place]);
  });

  test('the list is the same file on iOS, with each food in one place', () => {
    const web = readFileSync(new URL('../src/lib/food-storage.json', import.meta.url), 'utf8');
    expect(readFileSync(new URL('../ios/SousChef/Domain/FoodStorage.json', import.meta.url), 'utf8')).toBe(web);
    const lists = JSON.parse(web) as Record<string, Record<string, string[]>>;
    for (const group of Object.values(lists)) {
      const keys = Object.values(group).flat().map((term) => term.startsWith('=') ? term : foodWords(term).map(foodStem).join(' '));
      expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
    }
  });

  test('an unknown name falls back to its category', () => {
    expect(suggestPlacement('zzgrobnik', 'Dairy')).toBe('fridge');
    expect(suggestPlacement('zzgrobnik', 'Meat & Seafood')).toBe('fridge');
    expect(suggestPlacement('zzgrobnik', 'Produce')).toBe('fridge');
    expect(suggestPlacement('zzgrobnik', 'Frozen')).toBe('freezer');
    expect(suggestPlacement('zzgrobnik', ' canned goods ')).toBe('pantry');
    expect(suggestPlacement('zzgrobnik', 'Homemade')).toBeUndefined();
    // The name outranks the category.
    expect(suggestPlacement('Evaporated milk', 'Dairy')).toBe('pantry');
    const placed = Object.fromEntries(INVENTORY_CATEGORY_OPTIONS.map((category) => [category, suggestPlacement('zzgrobnik', category)]));
    expect(placed).toEqual({
      Produce: 'fridge', Dairy: 'fridge', 'Meat & Seafood': 'fridge', Frozen: 'freezer', Pantry: 'pantry', Bakery: 'pantry',
      'Canned Goods': 'pantry', 'Grains & Rice': 'pantry', 'Pasta & Noodles': 'pantry', 'Spices & Seasonings': 'pantry',
      'Condiments & Sauces': 'pantry', Snacks: 'pantry', Beverages: undefined, Other: undefined,
    });
  });

  test('the reason names what matched', () => {
    expect(matchPlacement('Organic Whole Milk')).toEqual({ location: 'fridge', reason: 'milk', basis: 'name' });
    expect(matchPlacement('Sweet potatoes')).toMatchObject({ reason: 'sweet potato' });
    expect(matchPlacement('zzgrobnik', 'Dairy')).toEqual({ location: 'fridge', reason: 'Dairy', basis: 'category' });
  });

  test('a suggestion maps onto the household\'s own locations', () => {
    const locations = [{ id: 'a', name: 'Garage shelf' }, { id: 'b', name: 'Pantry' }, { id: 'c', name: 'Refrigerator' }, { id: 'd', name: 'Chest freezer' }];
    expect(locations.map((location) => locationKind(location.name))).toEqual(['pantry', 'pantry', 'fridge', 'freezer']);
    expect(locationOfKind(locations, 'pantry')?.id).toBe('b');
    expect(locationOfKind(locations, 'fridge')?.id).toBe('c');
    expect(locationOfKind(locations, 'freezer')?.id).toBe('d');
    expect(locationOfKind(locations.slice(0, 2), 'fridge')).toBeUndefined();
    expect(locationOfKind(locations, undefined)).toBeUndefined();
  });
});
