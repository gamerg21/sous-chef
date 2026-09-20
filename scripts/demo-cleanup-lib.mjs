// Call inside an IMMEDIATE transaction. All names here are fixed, never request input.
export function cleanupExpiredDemos(sql,now=Date.now()) {
 const users=sql.prepare("SELECT id FROM users WHERE json_extract(data,'$.demoExpiresAt') < ? LIMIT 100").all(now);
 for(const user of users) {
  const memberships=sql.prepare("SELECT data FROM householdMembers WHERE json_extract(data,'$.userId')=?").all(user.id);
  for(const row of memberships) {
   const householdId=JSON.parse(row.data).householdId;
   const others=sql.prepare("SELECT COUNT(*) AS n FROM householdMembers WHERE json_extract(data,'$.householdId')=? AND json_extract(data,'$.userId')<>?").get(householdId,user.id);
   if(Number(others.n))continue;
   const recipes=sql.prepare("SELECT id FROM recipes WHERE json_extract(data,'$.householdId')=?").all(householdId);
   for(const recipe of recipes)for(const table of ['recipeIngredients','recipeSteps','mediaAssets','publications','recipeOrigins','communityRecipeLikes','communityRecipeSaves'])sql.prepare(`DELETE FROM "${table}" WHERE json_extract(data,'$.recipeId')=?`).run(recipe.id);
   const lists=sql.prepare("SELECT id FROM shoppingLists WHERE json_extract(data,'$.householdId')=?").all(householdId);
   for(const list of lists)sql.prepare("DELETE FROM shoppingListItems WHERE json_extract(data,'$.shoppingListId')=?").run(list.id);
   const foods=sql.prepare("SELECT json_extract(data,'$.foodItemId') AS id FROM inventoryItems WHERE json_extract(data,'$.householdId')=?").all(householdId);
   for(const table of ['householdMembers','kitchenLocations','inventoryItems','recipes','shoppingLists','aiProviderSettings','integrations','installedExtensions'])sql.prepare(`DELETE FROM "${table}" WHERE json_extract(data,'$.householdId')=?`).run(householdId);
   sql.prepare('DELETE FROM households WHERE id=?').run(householdId);
   for(const food of foods){const refs=['inventoryItems','recipeIngredients','barcodes'].some(table=>sql.prepare(`SELECT 1 FROM "${table}" WHERE json_extract(data,'$.foodItemId')=? LIMIT 1`).get(food.id));if(!refs)sql.prepare('DELETE FROM foodItems WHERE id=?').run(food.id);}
  }
  for(const table of ['householdMembers','userPreferences','userUnitUsage','userIngredientUnitPreferences','communityConnections','communityRecipeLikes','communityRecipeSaves','appAdmins'])sql.prepare(`DELETE FROM "${table}" WHERE json_extract(data,'$.userId')=?`).run(user.id);
  sql.prepare('DELETE FROM users WHERE id=?').run(user.id);
 }
 return users.length;
}
