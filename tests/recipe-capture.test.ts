import { describe, expect, test } from 'vitest'
import { analyzeRecipeText, captureIngredient, captureRecipe } from '../src/lib/recipe-capture'

describe('recipe text capture', () => {
  test('captures fractions, counts, steps, attribution, and original text without saving', () => {
    const text = 'Pancakes\nA family recipe\nIngredients\n1½ cups flour\n2 eggs\n250 ml milk\nInstructions\n1. Mix.\n2. Fry.'
    const draft = captureRecipe(text, 'https://example.com/pancakes')
    expect(draft.title).toBe('Pancakes')
    expect(draft.description).toBe('A family recipe')
    expect(draft.ingredients).toMatchObject([{ name:'flour', quantity:1.5, unit:'cups' }, { name:'eggs', quantity:2, unit:'each' }, { name:'milk', quantity:250, unit:'ml' }])
    expect(draft.steps.map(step => step.text)).toEqual(['Mix.', 'Fry.'])
    expect(draft.notes).toContain(text)
    expect(draft.visibility).toBe('private')
  })
  test('preserves unparsed amounts instead of inventing quantities', () => {
    expect(captureIngredient('1–2 cups sugar', 0)).toEqual({ id:'ingredient-0', name:'sugar', note:'1–2 cups' })
    expect(captureIngredient('Salt to taste', 1).quantity).toBeUndefined()
    expect(captureIngredient('1/0 cup water', 2).quantity).toBeUndefined()
  })
  test('reads common website ingredient formats', () => {
    expect(captureIngredient('1 cup (240ml) whole milk', 0)).toMatchObject({ name:'whole milk', quantity:1, unit:'cup', note:'240ml' })
    expect(captureIngredient('2 and 1/4 teaspoons (7g) instant or active dry yeast', 0)).toMatchObject({ name:'instant or active dry yeast', quantity:2.25, unit:'teaspoons', note:'7g' })
    expect(captureIngredient('6 Tablespoons (85g) unsalted butter', 0)).toMatchObject({ quantity:6, unit:'tablespoons', name:'unsalted butter' })
    expect(captureIngredient('2 large eggs', 0)).toMatchObject({ name:'eggs', quantity:2, unit:'each', note:'large' })
    expect(captureIngredient('1–2 quarts vegetable oil', 0)).toMatchObject({ name:'vegetable oil', note:'1–2 quarts' })
    expect(captureIngredient('▢ 1 onion, finely diced', 0)).toMatchObject({ name:'onion', quantity:1, note:'finely diced' })
    expect(captureIngredient('500g flour', 0)).toMatchObject({ name:'flour', quantity:500, unit:'g' })
    expect(captureIngredient('1 (14 oz) can diced tomatoes', 0)).toMatchObject({ name:'diced tomatoes', quantity:1, unit:'can', note:'14 oz' })
    expect(captureIngredient('2 cups of flour', 0)).toMatchObject({ name:'flour', unit:'cups' })
    expect(captureIngredient('a pinch of salt', 0)).toMatchObject({ name:'salt', quantity:1, unit:'pinch' })
  })
  test('builds a draft from an ingredient list with no headings or title', () => {
    const text = '1 cup (240ml) whole milk\n2 and 1/4 teaspoons (7g) instant or active dry yeast\n1/3 cup (65g) granulated sugar\n2 large eggs\n1–2 quarts vegetable oil'
    const { recipe, warnings } = analyzeRecipeText(text, 'https://sallysbakingaddiction.com/how-to-make-doughnuts/')
    expect(recipe.title).toBe('How to Make Doughnuts')
    expect(recipe.ingredients).toHaveLength(5)
    expect(recipe.steps).toHaveLength(0)
    expect(warnings.some(w => w.startsWith('No steps'))).toBe(true)
  })
  test('splits unlabeled ingredients from steps and ignores page clutter', () => {
    const text = 'Garlic Pasta\nPrint\nServings: 4\nTotal Time: 1 hour 5 minutes\n200 g spaghetti\n3 cloves garlic, minced\nSalt to taste\nBring a large pot of salted water to a boil and cook the pasta.\nMeanwhile, fry the garlic in olive oil until golden.'
    const { recipe } = analyzeRecipeText(text)
    expect(recipe.title).toBe('Garlic Pasta')
    expect(recipe.servings).toBe(4)
    expect(recipe.totalTimeMinutes).toBe(65)
    expect(recipe.ingredients.map(item => item.name)).toEqual(['spaghetti', 'garlic', 'Salt to taste'])
    expect(recipe.steps).toHaveLength(2)
  })
  test('keeps ingredient and step groups', () => {
    const { recipe } = analyzeRecipeText('Cake\nIngredients\nFor the glaze:\n1 cup sugar\nInstructions\nGlaze:\nWhisk the sugar with milk.')
    expect(recipe.ingredients[0]).toMatchObject({ name:'sugar', note:'For the glaze' })
    expect(recipe.steps[0].text).toBe('Glaze: Whisk the sugar with milk.')
  })
  test('rejects empty text and unsafe source schemes', () => {
    expect(() => captureRecipe('   ')).toThrow('Paste a recipe first')
    expect(() => captureRecipe('Test\nIngredients\n1 cup milk\nMethod\nStir', 'javascript:alert(1)')).toThrow('source link')
  })
})
describe('recipe site ingredient quirks', () => {
  test('handles plus/minus measures, prices, and bare pinches', () => {
    expect(captureIngredient('2 cups minus 2 tablespoons cake flour', 0)).toMatchObject({ name:'cake flour', quantity:2, unit:'cups', note:'minus 2 tablespoons' })
    expect(captureIngredient('1 lb boneless, skinless chicken breast ($5.47)', 0)).toMatchObject({ name:'boneless, skinless chicken breast', quantity:1, unit:'lb' })
    expect(captureIngredient('Pinch freshly ground black pepper', 0)).toMatchObject({ name:'freshly ground black pepper', quantity:1, unit:'pinch' })
    expect(captureIngredient('Tortilla chips, to serve', 0)).toMatchObject({ name:'Tortilla chips', note:'to serve' })
  })
})
