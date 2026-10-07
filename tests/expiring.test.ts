import { describe, expect, test } from 'vitest';
import { daysBetween, expiringUsedBy, expiringWindow, expiryPhrase, findExpiring, findReminderItems, localDay, rankByExpiring, summarizeExpiring } from '../src/lib/expiring';
import { planCooking } from '../src/lib/cooking-plan';

const today = '2026-03-10';
const stock = [
  { id: 'milk', name: 'Milk', quantity: 1, expiresOn: '2026-03-12' },
  { id: 'spinach', name: 'Spinach', quantity: 200, expiresOn: '2026-03-12' },
  { id: 'yogurt', name: 'Yogurt', quantity: 1, expiresOn: '2026-03-08' },
  { id: 'eggs', name: 'Eggs', quantity: 6, expiresOn: '2026-03-20' },
  { id: 'empty', name: 'Cream', quantity: 0, expiresOn: '2026-03-10' },
  { id: 'rice', name: 'Rice', quantity: 1000 },
];

describe('expiring items', () => {
  test('keeps in-stock items inside the window, including expired ones, soonest first', () => {
    const found = findExpiring(stock, { today, withinDays: 3 });
    expect(found.map(item => [item.id, item.daysLeft])).toEqual([['yogurt', -2], ['milk', 2], ['spinach', 2]]);
    expect(findExpiring(stock, { today, withinDays: 10 }).map(item => item.id)).toContain('eggs');
    expect(findExpiring(stock, { today, withinDays: 1 }).map(item => item.id)).toEqual(['yogurt']);
  });

  test('reminders mention expired food through the day after its date, then stop', () => {
    const items = [
      { id: 'today', name: 'Milk', quantity: 1, expiresOn: '2026-03-10' },
      { id: 'yesterday', name: 'Yogurt', quantity: 1, expiresOn: '2026-03-09' },
      { id: 'older', name: 'Cream', quantity: 1, expiresOn: '2026-03-08' },
    ];
    expect(findReminderItems(items, { today, withinDays: 3 }).map(item => item.id)).toEqual(['yesterday', 'today']);
    expect(findExpiring(items, { today, withinDays: 3 }).map(item => item.id)).toEqual(['older', 'yesterday', 'today']);
  });

  test('falls back to three days for invalid windows', () => {
    expect(expiringWindow(undefined)).toBe(3);
    expect(expiringWindow(2.5)).toBe(3);
    expect(expiringWindow(99)).toBe(3);
    expect(expiringWindow(7)).toBe(7);
  });

  test('counts calendar days across month and daylight-saving boundaries', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-03-10', 'soon')).toBeNull();
    expect(localDay(new Date('2026-03-10T03:00:00Z'), 'America/Los_Angeles')).toBe('2026-03-09');
    expect(localDay(new Date('2026-03-10T03:00:00Z'), 'Not/AZone')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('summarizes reminders in plain language', () => {
    expect(summarizeExpiring([{ name: 'Milk', daysLeft: 2 }, { name: 'spinach', daysLeft: 2 }])).toBe('Milk and spinach expire in 2 days');
    expect(summarizeExpiring([{ name: 'milk', daysLeft: 0 }])).toBe('Milk expires today');
    expect(summarizeExpiring([{ name: 'Spinach', daysLeft: 2 }, { name: 'Yogurt', daysLeft: -1 }, { name: 'Milk', daysLeft: 1 }, { name: 'Eggs', daysLeft: 3 }]))
      .toBe('Yogurt expired yesterday; Milk expires tomorrow; Spinach expires in 2 days (+1 more)');
    expect(summarizeExpiring([])).toBe('');
    expect(expiryPhrase(-3)).toBe('expired 3 days ago');
  });
});

describe('cook with what is expiring', () => {
  const catalog = [{ labels: ['g', 'gram'], type: 'mass', factor: 1 }, { labels: ['each'], type: 'count', factor: 1 }];
  const pantry = [
    { id: 'spinach', name: 'Spinach', quantity: 200, unit: 'g', expiresOn: '2026-03-11' },
    { id: 'milk', name: 'Milk', quantity: 1, unit: 'each', expiresOn: '2026-03-12' },
    { id: 'pasta', name: 'Pasta', quantity: 500, unit: 'g' },
  ];
  const recipes = [
    { id: 'pasta', title: 'Pasta', plan: planCooking([{ id: '1', name: 'Pasta', quantity: 100, unit: 'g' }], pantry, catalog) },
    { id: 'saag', title: 'Saag', plan: planCooking([{ id: '1', name: 'Spinach', quantity: 150, unit: 'g' }, { id: '2', name: 'Cream', quantity: 100, unit: 'g' }], pantry, catalog) },
    // Unmeasured ingredients still count as using the item.
    { id: 'smoothie', title: 'Smoothie', plan: planCooking([{ id: '1', name: 'Spinach' }, { id: '2', name: 'Milk', quantity: 1, unit: 'each' }], pantry, catalog) },
    { id: 'omelette', title: 'Omelette', plan: planCooking([{ id: '1', name: 'Milk', quantity: 1, unit: 'each' }], pantry, catalog) },
  ];
  const expiring = findExpiring(pantry, { today, withinDays: 3 });
  const uses = (recipe: typeof recipes[number]) => expiringUsedBy(recipe.plan, expiring);

  test('reuses the cooking plan to find the expiring items a recipe uses', () => {
    expect(uses(recipes[1]).map(item => item.name)).toEqual(['Spinach']);
    expect(uses(recipes[2]).map(item => item.name)).toEqual(['Spinach', 'Milk']);
    expect(uses(recipes[0])).toEqual([]);
  });

  test('ranks by expiring items used, then soonest expiry, then readiness', () => {
    const readiness = (a: typeof recipes[number], b: typeof recipes[number]) => a.plan.missingIngredients.length - b.plan.missingIngredients.length;
    expect(rankByExpiring(recipes, uses, readiness).map(recipe => recipe.id)).toEqual(['smoothie', 'saag', 'omelette']);
    // Equal use and expiry: readiness decides.
    const tied = [recipes[1], { ...recipes[1], id: 'ready-saag', plan: planCooking([{ id: '1', name: 'Spinach', quantity: 50, unit: 'g' }], pantry, catalog) }];
    expect(rankByExpiring(tied, uses, readiness).map(recipe => recipe.id)).toEqual(['ready-saag', 'saag']);
  });
});
