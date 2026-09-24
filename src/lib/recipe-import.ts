import type { Recipe, RecipeStep } from '../components/recipes/types'
import { analyzeRecipeText, captureIngredient } from './recipe-capture'

/**
 * Turns a recipe web page into an editable draft. Most recipe sites publish
 * schema.org Recipe JSON-LD for search engines; when a page does not, we fall
 * back to the same local text heuristics used for pasted recipes.
 */
export type RecipeImport = { recipe: Recipe; method: 'structured' | 'page-text'; warnings: string[]; site: string }

const entities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', deg: '°',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔',
  times: '×', eacute: 'é', egrave: 'è', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', ccedil: 'ç', reg: '®', trade: '™', copy: '©',
}
export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match
    }
    return entities[code.toLowerCase()] ?? match
  })
}
/** Plain text from a JSON-LD string field, which sites often fill with HTML. */
function plain(value: unknown): string {
  if (typeof value !== 'string') return ''
  let text = decodeEntities(value)
  for (let i = 0; i < 2 && /<[a-z/!]/i.test(text); i++) text = decodeEntities(text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d)>/gi, '\n').replace(/<[^>]+>/g, ''))
  return text.replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
}
const list = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value]
const typeOf = (node: Record<string, unknown>) => list(node['@type']).map(type => String(type).replace(/^.*[/:]/, '').toLowerCase())

function parseJson(raw: string): unknown {
  const text = raw.trim().replace(/^<!--|-->$/g, '').replace(/^\s*\/\*<!\[CDATA\[\*\/|\/\*\]\]>\*\/\s*$/g, '')
  try { return JSON.parse(text) } catch {}
  // Some sites emit literal newlines or tabs inside strings.
  try { return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' ')) } catch { return undefined }
}

export function findJsonLdRecipes(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = []
  const seen = new Set<unknown>()
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 8 || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) { node.forEach(item => visit(item, depth + 1)); return }
    const record = node as Record<string, unknown>
    if (typeOf(record).includes('recipe')) found.push(record)
    for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item', 'hasPart']) visit(record[key], depth + 1)
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) visit(parseJson(match[1]), 0)
  return found
}

function parseDuration(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const iso = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i.exec(value.trim())
  if (!iso) return undefined
  const minutes = Math.round(Number(iso[1] ?? 0) * 1440 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0))
  return minutes > 0 && minutes < 60 * 24 * 14 ? minutes : undefined
}
function firstNumber(value: unknown): number | undefined {
  for (const item of list(value)) {
    const number = typeof item === 'number' ? item : Number(/\d+(?:\.\d+)?/.exec(plain(item))?.[0])
    if (Number.isFinite(number) && number > 0) return number
  }
  return undefined
}
const round = (value: number | undefined, digits: number) => value == null ? undefined : Math.round(value * 10 ** digits) / 10 ** digits
function instructionLines(value: unknown, depth = 0): string[] {
  if (depth > 5) return []
  if (typeof value === 'string') {
    const text = plain(value)
    const lines = text.split(/\n+/)
    // One long blob with inline numbering: "1. Mix. 2. Bake."
    if (lines.length === 1 && /(^|\s)\d+[.)]\s/.test(text)) return text.split(/(?:^|\s)(?=\d+[.)]\s)/).map(line => line.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean)
    return lines.map(line => line.replace(/^(step\s*\d+\s*[:.)-]?|\d+[.)])\s*/i, '').trim()).filter(Boolean)
  }
  if (Array.isArray(value)) return value.flatMap(item => instructionLines(item, depth + 1))
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const types = typeOf(record)
    if (types.includes('howtosection') || (record.itemListElement && !record.text)) {
      const steps = instructionLines(record.itemListElement, depth + 1)
      const name = plain(record.name)
      return name && steps.length ? [`${name}: ${steps[0]}`, ...steps.slice(1)] : steps
    }
    const text = plain(record.text) || plain(record.name) || plain(record.description)
    return text ? instructionLines(text, depth + 1) : []
  }
  return []
}

export function recipeFromJsonLd(node: Record<string, unknown>, pageUrl: string): { recipe: Recipe; warnings: string[] } {
  const title = plain(node.name) || plain(node.headline)
  const ingredientText = list(node.recipeIngredient ?? node.ingredients).map(plain).flatMap(item => item.split(/\n+/)).filter(Boolean).slice(0, 100)
  const ingredients = ingredientText.map((line, index) => captureIngredient(line, index))
  const steps: RecipeStep[] = instructionLines(node.recipeInstructions).slice(0, 100).map((text, index) => ({ id: `step-${index}`, text }))
  const nutrition = (node.nutrition && typeof node.nutrition === 'object' ? node.nutrition : {}) as Record<string, unknown>
  const tags = [...new Set([...list(node.recipeCategory), ...list(node.recipeCuisine), ...list(node.keywords).flatMap(item => plain(item).split(','))]
    .map(item => plain(item).toLowerCase()).filter(item => item && item.length <= 40))].slice(0, 10)
  const author = list(node.author).map(item => plain(item && typeof item === 'object' ? (item as Record<string, unknown>).name : item)).filter(Boolean).join(', ')
  const canonical = typeof node.url === 'string' && /^https?:\/\//i.test(node.url) ? node.url : pageUrl
  const host = new URL(pageUrl).hostname.replace(/^www\./, '')
  const warnings: string[] = []
  if (!title) warnings.push('Add a title — the site did not include one.')
  if (!ingredients.length) warnings.push('The site did not list ingredients. Add them in the editor.')
  if (!steps.length) warnings.push('The site did not list steps. Add them in the editor.')
  const uncertain = ingredients.filter(item => item.quantity == null && /\d/.test(item.name)).length
  if (uncertain) warnings.push(`${uncertain} ingredient amount${uncertain === 1 ? '' : 's'} could not be read — check ${uncertain === 1 ? 'it' : 'them'} in the editor.`)
  return {
    warnings,
    recipe: {
      id: 'captured-draft', title, visibility: 'private', sourceUrl: canonical,
      description: plain(node.description).slice(0, 2000) || undefined,
      servings: firstNumber(node.recipeYield ?? node.yield),
      totalTimeMinutes: parseDuration(node.totalTime) ?? (((parseDuration(node.prepTime) ?? 0) + (parseDuration(node.cookTime) ?? 0)) || undefined),
      caloriesKcal: round(firstNumber(nutrition.calories), 0), proteinGrams: round(firstNumber(nutrition.proteinContent), 1),
      carbsGrams: round(firstNumber(nutrition.carbohydrateContent), 1), fatGrams: round(firstNumber(nutrition.fatContent), 1),
      tags: tags.length ? tags : undefined,
      ingredients, steps,
      notes: `Imported from ${host}${author ? ` (recipe by ${author})` : ''}. Check ingredient names, quantities, and units before cooking.`,
    },
  }
}

function pageTitle(html: string) {
  const meta = /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:title|twitter:title)["'][^>]*>/i.exec(html)?.[0]
  const content = meta && /content\s*=\s*["']([^"']*)["']/i.exec(meta)?.[1]
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]
  const title = plain(content) || plain(h1) || plain(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1])
  return title.split(/\s+[|–—-]\s+/)[0].trim()
}
export function htmlToText(html: string) {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe|nav|header|footer|aside|form|button|select)\b[\s\S]*?<\/\1>/gi, '\n')
  return plain(body.replace(/<li\b[^>]*>/gi, '\n').replace(/<\/?(p|div|section|article|br|tr|h\d|ul|ol|li|dt|dd|table)\b[^>]*>/gi, '\n'))
}

export function recipeFromHtml(html: string, pageUrl: string): RecipeImport {
  const site = new URL(pageUrl).hostname.replace(/^www\./, '')
  const candidates = findJsonLdRecipes(html).map(node => recipeFromJsonLd(node, pageUrl))
  const best = candidates.sort((a, b) => (b.recipe.ingredients.length + b.recipe.steps.length) - (a.recipe.ingredients.length + a.recipe.steps.length))[0]
  if (best && best.recipe.ingredients.length) {
    if (!best.recipe.title) best.recipe.title = pageTitle(html)
    return { recipe: best.recipe, method: 'structured', warnings: best.recipe.title ? best.warnings.filter(w => !w.startsWith('Add a title')) : best.warnings, site }
  }
  const text = htmlToText(html)
  const lines = text.split('\n')
  const start = lines.findIndex(line => /^(?:the\s+)?ingredients?\b.{0,30}$/i.test(line.trim()))
  if (start < 0) throw new Error(`Could not find a recipe on ${site}. Copy the recipe text from the page and paste it instead.`)
  const rest = lines.slice(start, start + 400)
  const stop = rest.findIndex((line, index) => index > 0 && /^(nutrition(?: facts| information)?|comments?|reviews?|leave a (comment|reply|review)|related( recipes| posts)?|you (may|might) also like|more recipes|about (me|the author)|reader interactions)\b.{0,20}$/i.test(line.trim()))
  const analysis = analyzeRecipeText((stop > 0 ? rest.slice(0, stop) : rest).join('\n').slice(0, 50000), pageUrl, { title: pageTitle(html), keepOriginal: false })
  if (!analysis.recipe.ingredients.length) throw new Error(`Could not find a recipe on ${site}. Copy the recipe text from the page and paste it instead.`)
  analysis.recipe.notes = `Imported from ${site}. This site doesn't publish recipe data, so the draft was read from the page text — check it carefully before cooking.`
  return { recipe: analysis.recipe, method: 'page-text', warnings: ['This site doesn\'t publish recipe data, so Sous Chef read the page text. Check everything carefully.', ...analysis.warnings], site }
}
