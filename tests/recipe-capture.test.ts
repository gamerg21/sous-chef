import { describe, expect, test } from 'vitest'
import { captureIngredient, captureRecipe } from '../src/lib/recipe-capture'

describe('recipe text capture', () => {
  test('captures fractions, counts, steps, attribution, and original text without saving', () => {
    const text = 'Pancakes\nA family recipe\nIngredients\n1½ cups flour\n2 eggs\n250 ml milk\nInstructions\n1. Mix.\n2. Fry.'
    const draft = captureRecipe(text, 'https://example.com/pancakes')
    expect(draft.title).toBe('Pancakes')
    expect(draft.ingredients).toMatchObject([{ name:'flour', quantity:1.5, unit:'cups' }, { name:'eggs', quantity:2, unit:'each' }, { name:'milk', quantity:250, unit:'ml' }])
    expect(draft.steps.map(step => step.text)).toEqual(['Mix.', 'Fry.'])
    expect(draft.notes).toContain(text)
    expect(draft.visibility).toBe('private')
  })
  test('preserves unparsed amounts instead of inventing quantities', () => {
    expect(captureIngredient('1–2 cups sugar', 0)).toEqual({ id:'ingredient-0', name:'1–2 cups sugar' })
    expect(captureIngredient('Salt to taste', 1).quantity).toBeUndefined()
    expect(captureIngredient('1/0 cup water', 2).quantity).toBeUndefined()
  })
  test('requires explicit sections and rejects unsafe source schemes', () => {
    expect(() => captureRecipe('Just some text')).toThrow('Ingredients heading')
    expect(() => captureRecipe('Test\nIngredients\n1 cup milk\nMethod\nStir', 'javascript:alert(1)')).toThrow('source link')
  })
})
