import { afterEach, describe, expect, test, vi } from 'vitest'
import { generateRecipeWithProvider, parseAiRecipe } from '../src/server/kitchen/lib/recipeAi'
const draft = { title: 'Warm milk', servings: 2, totalTimeMinutes: 5, ingredients: [{ name: 'Milk', quantity: 500, unit: 'ml' }], steps: [{ text: 'Warm gently.' }] }
afterEach(() => vi.unstubAllGlobals())

describe('structured pantry recipe generation', () => {
  for (const provider of ['openai', 'anthropic', 'google']) test(`${provider} normalizes a complete draft without saving or disclosing key in URL`, async () => {
    const generated = JSON.stringify(draft)
    const payload = provider === 'openai' ? { choices: [{ finish_reason: 'stop', message: { content: generated } }] } : provider === 'anthropic' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: generated }] } : { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: generated }] } }] }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
    vi.stubGlobal('fetch', fetch)
    expect(await generateRecipeWithProvider(provider, 'test-model', 'test-key', [{ name: 'Milk', quantity: 1, unit: 'l' }], 'Quick')).toEqual(draft)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).not.toContain('test-key')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('apiKey')
  })
  test('rejects invalid quantities, missing instructions, and truncated output', async () => {
    expect(() => parseAiRecipe(JSON.stringify({ ...draft, servings: -1 }))).toThrow()
    expect(() => parseAiRecipe(JSON.stringify({ ...draft, steps: [] }))).toThrow()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(draft) } }] }))))
    await expect(generateRecipeWithProvider('openai', 'test', 'key', [], '')).rejects.toThrow('incomplete or invalid')
  })
  test('does not expose provider error bodies or automatically retry billed calls', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('secret key and private pantry echoed by provider', { status: 429 }))
    vi.stubGlobal('fetch', fetch)
    await expect(generateRecipeWithProvider('openai', 'test', 'key', [], '')).rejects.toThrow('rate limit or credit limit')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  test('handles network timeouts with a safe actionable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sensitive transport details')))
    await expect(generateRecipeWithProvider('openai', 'test', 'key', [], '')).rejects.toThrow('could not be reached in time')
  })
})
