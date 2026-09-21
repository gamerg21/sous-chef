import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

/** Sample content uses the same records and cooking pipeline as a real kitchen. */
export async function seedDemoKitchen(ctx: MutationCtx, householdId: Id<'households'>) {
  const { db } = ctx;
  await db.patch(householdId, { name: 'Your demo kitchen' });
  const locations = await db.query('kitchenLocations').withIndex('by_householdId', q => q.eq('householdId', householdId)).collect();
  const foods = new Map<string, Id<'foodItems'>>();
  const stock = [
    ['Pasta', 500, 'g', 'Pantry', undefined],
    ['Rice', 500, 'g', 'Pantry', undefined],
    ['Olive oil', 250, 'ml', 'Pantry', undefined],
    ['Chickpeas', 400, 'g', 'Pantry', undefined],
    ['Tomatoes', 4, 'each', 'Fridge', 4],
    ['Spinach', 150, 'g', 'Fridge', 1],
    ['Lemons', 3, 'each', 'Fridge', 7],
    ['Eggs', 6, 'each', 'Fridge', 10],
    ['Frozen peas', 300, 'g', 'Freezer', undefined],
  ] as const;
  for (const [name, quantity, unit, locationName, days] of stock) {
    const existing = await db.query('foodItems').withIndex('by_name', q => q.eq('name', name)).first();
    const foodItemId = existing?._id ?? await db.insert('foodItems', { name });
    foods.set(name, foodItemId);
    const location = locations.find(item => item.name === locationName);
    if (!location) throw new Error(`Missing demo location: ${locationName}`);
    await db.insert('inventoryItems', {
      householdId, foodItemId, locationId: location._id, quantity, unit,
      expiresOn: days === undefined ? undefined : new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
    });
  }
  const recipes = [
    {
      title: 'Weeknight tomato pasta', description: 'Ready with what is already in your pantry. Try cooking it to see your stock update.', time: 20,
      ingredients: [['Pasta', 200, 'g'], ['Tomatoes', 2, 'each'], ['Olive oil', 15, 'ml']],
      steps: ['Boil a pot of water and cook the pasta according to its packet instructions.', 'Chop the tomatoes. Warm the olive oil in a pan and simmer the tomatoes until softened.', 'Drain the pasta, reserving a little cooking water. Toss with the tomatoes, adding a splash of water if needed.'],
    },
    {
      title: 'Lemon & spinach pasta', description: 'A good way to use the spinach soon. Add the missing Parmesan to your shopping list.', time: 25,
      ingredients: [['Pasta', 200, 'g'], ['Spinach', 100, 'g'], ['Lemons', 1, 'each'], ['Olive oil', 15, 'ml'], ['Parmesan', 40, 'g']],
      steps: ['Cook the pasta and reserve a mug of the cooking water.', 'Warm the olive oil and wilt the spinach. Add the zest and juice of the lemon.', 'Toss in the pasta with grated Parmesan and a splash of cooking water. Stir until coated.'],
    },
    {
      title: 'Pea & egg fried rice', description: 'A quick dinner from your pantry, fridge, and freezer.', time: 30,
      ingredients: [['Rice', 150, 'g'], ['Frozen peas', 100, 'g'], ['Eggs', 2, 'each'], ['Olive oil', 15, 'ml']],
      steps: ['Cook the rice according to its packet instructions.', 'Heat the oil in a large pan. Beat the eggs, add them to the pan, and stir until fully set.', 'Add the peas and cook until piping hot. Fold in the rice and stir-fry everything together.'],
    },
  ];
  for (const recipe of recipes) {
    const recipeId = await db.insert('recipes', { householdId, title: recipe.title, description: recipe.description, servings: 2, totalTimeMinutes: recipe.time, visibility: 'private', favorited: recipe.title === 'Weeknight tomato pasta', tags: ['Weeknight', 'Vegetarian'] });
    for (const [order, ingredient] of recipe.ingredients.entries()) {
      const [name, quantity, unit] = ingredient as [string, number, string];
      await db.insert('recipeIngredients', { recipeId, order, name, quantity, unit, foodItemId: foods.get(name), mappingLabel: foods.has(name) ? name : undefined });
    }
    for (const [order, text] of recipe.steps.entries()) await db.insert('recipeSteps', { recipeId, order, text });
  }
  const list = await db.query('shoppingLists').withIndex('by_householdId', q => q.eq('householdId', householdId)).first();
  const shoppingListId = list?._id ?? await db.insert('shoppingLists', { householdId });
  await db.insert('shoppingListItems', { shoppingListId, name: 'Sourdough bread', quantity: 1, unit: 'each', checked: false, source: 'manual' });
}
