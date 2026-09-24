import { parseAmount } from './units'
import type { Recipe, RecipeIngredient, RecipeStep } from '../components/recipes/types'

const fractions: Record<string, string> = { '¼':'1/4', '½':'1/2', '¾':'3/4', '⅓':'1/3', '⅔':'2/3', '⅛':'1/8', '⅜':'3/8', '⅝':'5/8', '⅞':'7/8', '⅙':'1/6', '⅚':'5/6', '⅕':'1/5' }
const fractionChars = /[¼½¾⅓⅔⅛⅜⅝⅞⅙⅚⅕]/g
const units = 'fl\\.?\\s*oz|fluid ounces?|tablespoons?|teaspoons?|tbsps?|tbs|tsps?|milliliters?|millilitres?|liters?|litres?|kilograms?|grams?|ounces?|pounds?|lbs?|cups?|quarts?|qts?|pints?|pts?|gallons?|gal|ml|cl|dl|kg|mg|oz|g|l|each|count|cloves?|slices?|cans?|tins?|jars?|bottles?|packages?|packets?|pkgs?|boxes|box|bags?|sticks?|pinch(?:es)?|dash(?:es)?|sprigs?|bunch(?:es)?|heads?|stalks?|handfuls?|pieces?|pcs?|drops?|leaves|leaf|fillets?|sheets?|envelopes?'
const unitPattern = new RegExp(`^(${units})\\.?(?:\\s+of)?(?:\\s+|$)(.*)$`, 'i')
const attachedUnit = new RegExp(`^(\\d+(?:\\.\\d+)?)(${units})\\b\\.?\\s*(.*)$`, 'i')
const amount = String.raw`\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:\.\d+)?`
const range = new RegExp(`^(${amount})\\s*(?:-|–|—|to|or)\\s*(${amount})\\s+(.+)$`, 'i')
const single = new RegExp(`^(${amount})\\s+(.+)$`)
const prepWords = /\b(diced|chopped|minced|sliced|softened|melted|divided|to taste|peeled|room temperature|optional|drained|rinsed|beaten|grated|shredded|crushed|cut|halved|quartered|thinly|finely|roughly|coarsely|packed|sifted|cubed|cooked|uncooked|trimmed|seeded|cored|julienned|torn|zested|juiced|toasted|warmed|cold|chilled|thawed|at room|plus more|or more|for serving|for garnish|to serve|serving|about|such as|like)\b/i
const sizes = /^(extra[-\s]large|large|medium|small|jumbo)\s+(.+)$/i

function cleanLine(line: string) {
  return line.replace(/^\s*(?:[-•*·▢☐□✓✔◻]|\[\s?\])\s*/, '').replace(/\s+/g, ' ').trim()
}

function normalizeAmounts(text: string) {
  return text
    .replace(/(\d)\s*([¼½¾⅓⅔⅛⅜⅝⅞⅙⅚⅕])/g, '$1 $2').replace(fractionChars, value => fractions[value])
    .replace(/⁄/g, '/')
    .replace(new RegExp(`^(\\d+)\\s+(?:and|&|\\+)\\s+(\\d+\\s*/\\s*\\d+)`, 'i'), '$1 $2')
    .replace(/^(a|an|one)\s+(?=[a-z])/i, '1 ').replace(/^half\s+(?:a\s+|an\s+)?/i, '1/2 ').replace(/^(pinch|dash|handful|sprig)\b/i, '1 $1')
}

function joinNote(...parts: (string | undefined)[]) {
  const note = parts.map(part => part?.trim()).filter(Boolean).join('; ')
  return note || undefined
}

/** Parses one ingredient line without inventing amounts it cannot read. */
export function captureIngredient(line: string, index: number, group?: string): RecipeIngredient {
  const original = cleanLine(line)
  const base = { id: `ingredient-${index}` }
  const withNote = (ingredient: Omit<RecipeIngredient, 'id'>) => {
    const note = joinNote(ingredient.note, group)
    return { ...base, ...ingredient, ...(note ? { note } : {}) }
  }
  let text = normalizeAmounts(original)
  const attached = text.match(attachedUnit)
  if (attached) text = `${attached[1]} ${attached[2]} ${attached[3]}`.trim()

  const splitRest = (rest: string) => {
    const notes: string[] = []
    let name = rest.trim()
    // "(240ml)" or "(14 oz)" right after the amount or unit is an alternate measure; "plus 1 Tbsp." extends it.
    for (let guard = 0; guard < 4; guard++) {
      const leadingParen = name.match(/^\(([^)]*)\)\s*(.*)$/)
      const plus = name.match(/^(plus|minus|\+)\s+([\d\s/.]+\s*[a-z]+\.?)\s+(.*)$/i)
      if (leadingParen) { notes.push(leadingParen[1]); name = leadingParen[2] }
      else if (plus) { notes.push(`${plus[1] === '+' ? 'plus' : plus[1].toLowerCase()} ${plus[2].replace(/\.$/, '')}`); name = plus[3] }
      else break
    }
    return { name, notes }
  }
  const finishName = (raw: string, notes: string[]) => {
    let name = raw.replace(/^of\s+/i, '').replace(/\s*\(\s*\$[\d.,]+\s*\)/g, '').replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim()
    const trailingParen = name.match(/^(.+?)\s*\(([^()]*)\)$/)
    if (trailingParen) { name = trailingParen[1]; notes.push(trailingParen[2]) }
    const comma = name.indexOf(',')
    if (comma > 0 && prepWords.test(name.slice(comma + 1))) { notes.push(name.slice(comma + 1)); name = name.slice(0, comma).trim() }
    const size = name.match(sizes)
    if (size) { notes.unshift(size[1].toLowerCase()); name = size[2] }
    return { name: name || raw.trim(), note: joinNote(...notes) }
  }
  const unitAndName = (rest: string) => {
    const first = splitRest(rest)
    const unit = first.name.match(unitPattern)
    if (!unit) return { unit: undefined, ...finishName(first.name, first.notes) }
    const second = splitRest(unit[2])
    const finished = finishName(second.name, [...first.notes, ...second.notes])
    return { unit: unit[1].toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, ''), ...finished }
  }

  const ranged = text.match(range)
  if (ranged) {
    const parsed = unitAndName(ranged[3])
    if (!parsed.name) return withNote({ name: original })
    const measure = `${ranged[1]}–${ranged[2]}${parsed.unit ? ` ${parsed.unit}` : ''}`
    return withNote({ name: parsed.name, note: joinNote(measure, parsed.note) })
  }
  const match = text.match(single)
  const quantity = match ? parseAmount(match[1]) : null
  if (!match || quantity == null || quantity <= 0) {
    const comma = original.indexOf(',')
    if (comma > 0 && !/\d/.test(original) && prepWords.test(original.slice(comma + 1))) return withNote({ name: original.slice(0, comma).trim(), note: original.slice(comma + 1).trim() || undefined })
    return withNote({ name: original })
  }
  const parsed = unitAndName(match[2])
  if (!parsed.name) return withNote({ name: original })
  return withNote({ name: parsed.name, quantity, unit: parsed.unit ?? 'each', ...(parsed.note ? { note: parsed.note } : {}) })
}

const noise = [
  /^(print|pin|save|share|email|jump to (recipe|video)|rate (this )?recipe|cook mode|scale|servings? ?[+-]|metric|us customary|imperial|close|comments?|reply|advertisement|ad|skip to content|video|watch|play)\b.{0,20}$/i,
  /^prevent your screen from going dark/i,
  /^did you make this recipe/i,
  /^([★☆⭐]\s*)+/,
  /^\d(\.\d)? from \d+ (votes|reviews|ratings)/i,
  /^\d+x$/i,
  /^(1x\s*)?2x\s*3x$/i,
]
const ingredientHeading = /^(?:the\s+)?ingredients?(?:\s+(?:list|for\b.*))?\s*:?(?:\s*\([^)]*\))?$/i
const stepHeading = /^(?:the\s+)?(instructions?|directions?|method|steps?|preparation|how to make(?: it| them)?)\s*:?$/i
const notesHeading = /^(?:recipe\s+)?(notes?|tips|cook'?s notes)\s*:?$/i
const metaLine = /^(servings?|serves|yield|makes|prep(?:aration)? time|cook(?:ing)? time|total time|active time|inactive time|chill time|rest time|calories|course|cuisine|keyword|author)\s*:?\s*(.*)$/i
const stepVerbs = /^(preheat|mix|stir|whisk|combine|add|bake|cook|heat|place|pour|bring|let|leave|remove|serve|in a|in the|using|make|beat|fold|cut|chop|roll|transfer|cover|season|simmer|boil|fry|grease|line|melt|knead|divide|shape|top|sprinkle|spread|set|allow|repeat|drain|rinse|toss|arrange|garnish|refrigerate|chill|freeze|blend|process|pulse|sift|cream|brush|drizzle|return|reduce|turn|flip|once|when|while|meanwhile|after|then|finally)\b/i

function isGroupHeading(line: string) {
  return line.length <= 50 && !/\d/.test(line) && (/:$/.test(line) || /^for (the )?\w/i.test(line)) && !/\.\s*$/.test(line)
}
function looksLikeIngredient(line: string) {
  if (/^(step\s*\d+|\d+[.)]\s)/i.test(line)) return false
  const words = line.split(/\s+/).length
  if (new RegExp(`^(\\d|[¼½¾⅓⅔⅛⅜⅝⅞]|(a|an|one|two|three|half)\\s+(${units}|large|medium|small|few|couple)\\b)`, 'i').test(line)) return line.length <= 140 && !(words > 12 && stepVerbs.test(line.replace(/^\S+\s+/, '')))
  return words <= 8 && /\b(to taste|as needed|for (serving|garnish|frying|dusting|greasing)|optional)\b/i.test(line)
}
function looksLikeStep(line: string) {
  if (/^(step\s*\d+|\d+[.)]\s)/i.test(line)) return true
  const words = line.split(/\s+/).length
  return words >= 10 || (words >= 3 && stepVerbs.test(line)) || (words >= 5 && /[.!]$/.test(line))
}
function minutesFrom(text: string) {
  const hours = Number(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)\b/i.exec(text)?.[1] ?? 0)
  const minutes = Number(/(\d+)\s*(m|min|mins|minutes?)\b/i.exec(text)?.[1] ?? 0)
  const total = Math.round(hours * 60 + minutes)
  return total > 0 ? total : undefined
}
export function titleFromUrl(url?: string) {
  if (!url) return undefined
  try {
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop()?.replace(/\.(html?|php|aspx?)$/i, '')
    if (!slug || /^\d+$/.test(slug) || slug.length < 4) return undefined
    const words = slug.replace(/[-_]+/g, ' ').replace(/\b\d{3,}\b/g, '').replace(/\brecipe\b/gi, '').trim()
    if (!words) return undefined
    const small = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'with', 'in', 'on', 'for', 'or'])
    return words.split(/\s+/).map((word, i) => i > 0 && small.has(word.toLowerCase()) ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1)).join(' ')
  } catch { return undefined }
}

export function checkSourceUrl(sourceUrl?: string) {
  if (!sourceUrl?.trim()) return undefined
  let parsed: URL
  try { parsed = new URL(sourceUrl.trim()) } catch { throw new Error('Use a full source link, starting with https://') }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use a public http or https source link.')
  return parsed.href
}

export type RecipeCapture = {
  recipe: Recipe
  warnings: string[]
  /** Ingredients that kept a number in the name because the amount could not be read. */
  uncertainIngredients: number
}

/** Local, deterministic capture that always returns a reviewable draft when there is text to work with. */
export function analyzeRecipeText(text: string, sourceUrl?: string, options: { title?: string; keepOriginal?: boolean } = {}): RecipeCapture {
  if (text.length > 50000) throw new Error('Paste a recipe under 50,000 characters.')
  const url = checkSourceUrl(sourceUrl)
  const lines = text.split(/\r?\n/).map(cleanLine).filter(line => line && !noise.some(pattern => pattern.test(line)))
  if (!lines.length) throw new Error('Paste a recipe first.')

  let section: 'intro' | 'ingredients' | 'steps' | 'notes' = 'intro'
  let explicitIngredients = false
  let ingredientGroup: string | undefined
  let stepGroup: string | undefined
  const intro: string[] = []
  const ingredientLines: { line: string; group?: string }[] = []
  const stepLines: string[] = []
  const noteLines: string[] = []
  let servings: number | undefined
  let totalTimeMinutes: number | undefined
  let partialMinutes = 0
  let caloriesKcal: number | undefined

  for (const line of lines) {
    if (ingredientHeading.test(line)) { section = 'ingredients'; explicitIngredients = true; ingredientGroup = undefined; continue }
    if (stepHeading.test(line)) { section = 'steps'; stepGroup = undefined; continue }
    if (notesHeading.test(line)) { section = 'notes'; continue }
    const meta = section !== 'steps' && section !== 'notes' ? line.match(metaLine) : null
    if (meta && meta[2].length <= 60) {
      const key = meta[1].toLowerCase()
      if (/serv|yield|makes/.test(key)) servings ??= Number(/\d+/.exec(meta[2])?.[0]) || undefined
      else if (key === 'total time') totalTimeMinutes = minutesFrom(meta[2])
      else if (/prep|cook/.test(key)) partialMinutes += minutesFrom(meta[2]) ?? 0
      else if (key === 'calories') caloriesKcal = Number(/\d+/.exec(meta[2])?.[0]) || undefined
      continue
    }
    if (section === 'intro') {
      if (looksLikeIngredient(line)) section = 'ingredients'
      else if (looksLikeStep(line) && intro.length > 0 && /^(step\s*\d+|\d+[.)]\s)/i.test(line)) section = 'steps'
      else { intro.push(line); continue }
    }
    if (section === 'ingredients') {
      if (isGroupHeading(line) && !looksLikeIngredient(line)) { ingredientGroup = line.replace(/:$/, '').trim(); continue }
      if (!explicitIngredients && looksLikeStep(line) && !looksLikeIngredient(line)) section = 'steps'
      else { ingredientLines.push({ line, group: ingredientGroup }); continue }
    }
    if (section === 'steps') {
      if (isGroupHeading(line) && !/^(step\s*\d+|\d+[.)]\s)/i.test(line)) { stepGroup = line.replace(/:$/, '').trim(); continue }
      const clean = line.replace(/^(step\s*\d+\s*[:.)-]?|\d+[.)])\s*/i, '').trim()
      if (!clean) continue
      stepLines.push(stepGroup ? `${stepGroup}: ${clean}` : clean)
      stepGroup = undefined
      continue
    }
    noteLines.push(line)
  }

  const warnings: string[] = []
  let title = options.title?.trim()
  if (!title) {
    const first = intro[0]
    if (first && first.length <= 120 && !/[.!?]$/.test(first)) { title = first; intro.shift() }
    else title = titleFromUrl(url)
  }
  if (!title) { title = ''; warnings.push('Add a title — none was found in the text.') }
  if (ingredientLines.length > 100 || stepLines.length > 100) throw new Error('Use up to 100 ingredients and 100 instruction lines.')

  const ingredients = ingredientLines.map((item, index) => captureIngredient(item.line, index, item.group?.toLowerCase().startsWith('for ') ? item.group : item.group && `for the ${item.group.toLowerCase()}`))
  const steps: RecipeStep[] = stepLines.map((line, index) => ({ id: `step-${index}`, text: line }))
  const uncertainIngredients = ingredients.filter(item => item.quantity == null && /\d/.test(item.name)).length
  if (!ingredients.length) warnings.push('No ingredients were found. Put each ingredient on its own line, starting with the amount.')
  if (!steps.length) warnings.push('No steps were found. Add them in the editor, or include the instructions when you paste.')
  if (uncertainIngredients) warnings.push(`${uncertainIngredients} ingredient amount${uncertainIngredients === 1 ? '' : 's'} could not be read — check ${uncertainIngredients === 1 ? 'it' : 'them'} in the editor.`)

  const header = 'Captured text — check ingredient names, quantities, and units before cooking.'
  const notes = [noteLines.length ? noteLines.join('\n') : undefined, options.keepOriginal === false ? header : `${header}\n\n${text.trim()}`].filter(Boolean).join('\n\n')
  return {
    recipe: {
      id: 'captured-draft', title, description: intro.join('\n').slice(0, 2000) || undefined,
      visibility: 'private', sourceUrl: url,
      servings, totalTimeMinutes: totalTimeMinutes ?? (partialMinutes || undefined), caloriesKcal,
      ingredients, steps, notes,
    },
    warnings, uncertainIngredients,
  }
}

export function captureRecipe(text: string, sourceUrl?: string): Recipe {
  return analyzeRecipeText(text, sourceUrl).recipe
}
