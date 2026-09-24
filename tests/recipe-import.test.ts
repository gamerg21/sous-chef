import { describe, expect, test } from 'vitest'
import { recipeFromHtml } from '../src/lib/recipe-import'
import { checkPublicUrl, isPublicAddress } from '../src/server/kitchen/lib/publicFetch'

const ld = (data: unknown) => `<html><head><title>Site</title><script type="application/ld+json">${JSON.stringify(data)}</script></head><body></body></html>`

describe('recipe link import', () => {
  test('reads schema.org Recipe JSON-LD inside a @graph', () => {
    const html = ld({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, {
      '@type': ['Recipe'], name: 'Homemade Doughnuts &amp; Glaze', description: '<p>Soft &amp; fluffy.</p>', recipeYield: ['12', '12 doughnuts'],
      prepTime: 'PT2H', cookTime: 'PT15M', author: { '@type': 'Person', name: 'Sally' }, keywords: 'doughnuts, breakfast', recipeCategory: 'Dessert',
      nutrition: { calories: '250 kcal', proteinContent: '5 g' },
      recipeIngredient: ['1 cup (240ml) whole milk', '2 large eggs'],
      recipeInstructions: [{ '@type': 'HowToSection', name: 'Dough', itemListElement: [{ '@type': 'HowToStep', text: 'Warm the milk.' }, { '@type': 'HowToStep', text: 'Add eggs.' }] }, { '@type': 'HowToStep', text: 'Fry.' }],
    }] })
    const result = recipeFromHtml(html, 'https://www.example.com/doughnuts/')
    expect(result.method).toBe('structured')
    expect(result.warnings).toEqual([])
    expect(result.site).toBe('example.com')
    expect(result.recipe).toMatchObject({ title: 'Homemade Doughnuts & Glaze', description: 'Soft & fluffy.', servings: 12, totalTimeMinutes: 135, caloriesKcal: 250, proteinGrams: 5, tags: ['dessert', 'doughnuts', 'breakfast'] })
    expect(result.recipe.ingredients[0]).toMatchObject({ name: 'whole milk', quantity: 1, unit: 'cup' })
    expect(result.recipe.steps.map(step => step.text)).toEqual(['Dough: Warm the milk.', 'Add eggs.', 'Fry.'])
    expect(result.recipe.notes).toContain('recipe by Sally')
  })
  test('falls back to page text when a site has no recipe data', () => {
    const html = '<html><head><meta property="og:title" content="Garlic Pasta | My Blog"></head><body><nav>Home</nav><h2>Ingredients</h2><ul><li>200 g spaghetti</li><li>3 cloves garlic</li></ul><h2>Instructions</h2><ol><li>Boil the pasta in salted water until tender.</li></ol><h3>Comments</h3><p>Great recipe, I will make this again soon!</p></body></html>'
    const result = recipeFromHtml(html, 'https://blog.example.com/garlic-pasta')
    expect(result.method).toBe('page-text')
    expect(result.recipe.title).toBe('Garlic Pasta')
    expect(result.recipe.ingredients).toHaveLength(2)
    expect(result.recipe.steps).toHaveLength(1)
  })
  test('explains when a page has no recipe', () => {
    expect(() => recipeFromHtml('<html><body><p>Hello</p></body></html>', 'https://example.com/')).toThrow('Could not find a recipe')
  })
  test('blocks private and local addresses', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '192.168.1.10', '172.20.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) expect(isPublicAddress(address)).toBe(false)
    expect(isPublicAddress('93.184.216.34')).toBe(true)
    expect(isPublicAddress('2606:4700::1')).toBe(true)
    for (const url of ['http://localhost/x', 'http://192.168.1.2/', 'http://[::1]/', 'http://nas.local/', 'http://printer/', 'https://example.com:8443/', 'ftp://example.com/', 'https://u:p@example.com/']) expect(() => checkPublicUrl(url)).toThrow()
    expect(checkPublicUrl('https://www.example.com/recipe').hostname).toBe('www.example.com')
  })
})
