/**
 * Turns an Open Food Facts product into what a pantry item needs: a clean
 * name, the package size as printed, how many cans or bottles a multipack
 * holds, servings, nutrition per 100 g and per serving, where to keep it,
 * and dietary labels. The data is crowd-sourced and sometimes contradicts
 * itself, so derived values are cross-checked and left out rather than
 * guessed. Mirrored on iOS in `ProductFacts.swift`; keep the two in step.
 */

import type { NutritionPer100g } from "./nutrition";

/** Fields requested from Open Food Facts; everything else is left behind. */
export const OFF_FIELDS = [
  "code", "product_name", "product_name_en", "generic_name", "generic_name_en", "abbreviated_product_name",
  "brands", "quantity", "product_quantity", "product_quantity_unit",
  "serving_size", "serving_quantity", "serving_quantity_unit", "packagings",
  "categories_tags", "labels_tags", "ingredients_text", "ingredients_text_en", "allergens_tags", "traces_tags",
  "ingredients_analysis_tags", "nutriscore_grade", "nova_group", "ecoscore_grade", "environmental_score_grade",
  "image_front_url", "image_front_small_url", "image_nutrition_url", "image_ingredients_url",
  "nutriments", "nutrition_data_per", "conservation_conditions", "conservation_conditions_en",
].join(",");

/**
 * Bumped when parsing learns something new, so cached lookups saved by an
 * older version are fetched again instead of lacking the new details.
 */
export const PRODUCT_FACTS_VERSION = 2;

export type StorageSuggestion = "pantry" | "fridge" | "freezer";

export interface ProductPackage {
  /** As printed: "18 oz (510 g)". */
  text?: string;
  /** The label's own amount and unit: 18 "oz". */
  amount?: number;
  unit?: string;
  /** Normalized net contents in grams or milliliters. */
  netQuantity?: number;
  netUnit?: "g" | "ml";
  /** Cans, bottles or bars in a multipack, when it holds more than one. */
  count?: number;
  /** What each one is, as a catalog unit label: "can", "bottle", "box", "pkg". */
  container?: string;
  /** Size of each one in a multipack, in the label's unit: 12 "fl oz". */
  eachAmount?: number;
  eachUnit?: string;
}

export interface ProductServing {
  /** As printed: "1 cup (249 g)". */
  text?: string;
  amount?: number;
  unit?: "g" | "ml";
  /** Servings in the whole package, rounded to the nearest half. */
  perPackage?: number;
}

export interface ProductFacts {
  brand?: string;
  categoriesTags?: string[];
  ingredientsText?: string;
  allergensTags?: string[];
  tracesTags?: string[];
  labelsTags?: string[];
  ingredientsAnalysisTags?: string[];
  nutriscoreGrade?: string;
  novaGroup?: number;
  ecoscoreGrade?: string;
  imageFrontUrl?: string;
  imageFrontSmallUrl?: string;
  imageNutritionUrl?: string;
  imageIngredientsUrl?: string;
  genericName?: string;
  packaging?: ProductPackage;
  serving?: ProductServing;
  nutritionPer100g?: NutritionPer100g;
  nutritionPerServing?: NutritionPer100g;
  /** Liquids are labeled per 100 ml. */
  nutritionBasis?: "100g" | "100ml";
  storage?: StorageSuggestion;
  storageText?: string;
}

export interface ParsedProduct {
  name: string;
  category?: string;
  facts: ProductFacts;
}

type Json = Record<string, unknown>;

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
};
const number = (value: unknown): number | undefined => {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
};
const tags = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.length && value.every((tag) => typeof tag === "string") ? (value as string[]) : undefined;
const httpsURL = (value: unknown): string | undefined => {
  const url = text(value);
  return url?.startsWith("https://") ? url : undefined;
};

/** Rounds to what a label would print: whole numbers past 100, else up to two decimals. */
export function tidy(value: number): number {
  if (Math.abs(value) >= 100) return Math.round(value);
  if (Math.abs(value) >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

// ── Measures ─────────────────────────────────────────────────────────────

type Measure = { amount: number; unit: string; base: number; kind: "mass" | "volume" };

// Label spellings to catalog units (src/server/kitchen/units.ts) and their
// factor to grams or milliliters. Centiliters and deciliters aren't in the
// catalog, so they become milliliters.
const MEASURE_UNITS: Array<[RegExp, string, number, "mass" | "volume"]> = [
  [/^(fl\.?\s*oz|fluid\s*ounces?)$/, "fl oz", 29.5735, "volume"],
  [/^(oz|ounces?)$/, "oz", 28.3495, "mass"],
  [/^(lbs?|pounds?)$/, "lb", 453.592, "mass"],
  [/^(kg|kilos?|kilograms?)$/, "kg", 1000, "mass"],
  [/^(g|gr|grams?|grammes?)$/, "g", 1, "mass"],
  [/^(ml|millilit(er|re)s?)$/, "ml", 1, "volume"],
  [/^cl$/, "cl", 10, "volume"],
  [/^dl$/, "dl", 100, "volume"],
  [/^(l|lit(er|re)s?)$/, "l", 1000, "volume"],
  [/^(gal|gallons?)$/, "gal", 3785.41, "volume"],
  [/^(qt|quarts?)$/, "qt", 946.353, "volume"],
  [/^(pt|pints?)$/, "pt", 473.176, "volume"],
];
const MEASURE = String.raw`(\d+(?:[.,]\d+)?)\s*(fl\.?\s*oz|fluid\s*ounces?|ounces?|oz|lbs?|pounds?|kilograms?|kilos?|kg|grammes?|grams?|gr|g|millilit(?:er|re)s?|ml|cl|dl|lit(?:er|re)s?|l|gallons?|gal|quarts?|qt|pints?|pt)\.?(?![a-z])`;

function readNumber(raw: string): number {
  // "1,500 g" groups thousands; "1,5 l" is a decimal comma.
  return Number(/^\d{1,3},\d{3}$/.test(raw) ? raw.replace(",", "") : raw.replace(",", "."));
}

function toMeasure(amountText: string, unitText: string): Measure | undefined {
  const amount = readNumber(amountText);
  const spelled = unitText.toLowerCase().replace(/\.$/, "").trim();
  const match = MEASURE_UNITS.find(([pattern]) => pattern.test(spelled));
  if (!match || !(amount > 0)) return undefined;
  const [, unit, factor, kind] = match;
  // Centiliters and deciliters read better as milliliters.
  if (unit === "cl" || unit === "dl") return { amount: tidy(amount * factor), unit: "ml", base: amount * factor, kind };
  return { amount, unit, base: amount * factor, kind };
}

/** Every measure in a label string, in order: "18 oz (510 g)" → 18 oz, 510 g. */
export function measures(label: string): Measure[] {
  const found: Measure[] = [];
  for (const match of label.matchAll(new RegExp(MEASURE, "gi"))) {
    const measure = toMeasure(match[1], match[2]);
    if (measure) found.push(measure);
  }
  return found;
}

const close = (a: number, b: number, tolerance = 0.06) => Math.abs(a - b) <= Math.max(a, b) * tolerance;

// ── Containers ───────────────────────────────────────────────────────────

const CONTAINERS: Array<[RegExp, string]> = [
  [/\b(cans?|tins?)\b/, "can"],
  [/\bjars?\b/, "jar"],
  [/\bbottles?\b/, "bottle"],
  [/\b(box(es)?|cartons?|bricks?)\b/, "box"],
  [/\b(bags?|sachets?|pouch(es)?)\b/, "bag"],
  [/\b(packs?|packets?|packages?|pkgs?|tubs?|pots?|trays?|containers?)\b/, "pkg"],
];
// Parts of a package rather than the package itself.
const COMPONENTS = /\b(caps?|lids?|labels?|films?|seals?|wrappers?|sleeves?|straws?)\b/;

function container(word: string | undefined): string | undefined {
  if (!word) return undefined;
  const words = word.toLowerCase().replace(/^[a-z]{2}:/, "").replace(/[-_]/g, " ");
  if (COMPONENTS.test(words)) return undefined;
  return CONTAINERS.find(([pattern]) => pattern.test(words))?.[1];
}

// ── Package and serving ─────────────────────────────────────────────────

export function parsePackage(product: Json): ProductPackage | undefined {
  const label = text(product.quantity);
  const netRaw = number(product.product_quantity);
  const netUnitRaw = text(product.product_quantity_unit)?.toLowerCase();
  const found = label ? measures(label) : [];
  const netUnit: "g" | "ml" | undefined =
    netUnitRaw === "ml" || netUnitRaw === "g" ? netUnitRaw : found[0]?.kind === "volume" ? "ml" : found[0] ? "g" : undefined;
  const net = netRaw && netRaw > 0 && netRaw < 1_000_000 ? netRaw : undefined;

  // A US drink's "12 oz" means fluid ounces.
  const fix = (measure: Measure): Measure =>
    measure.unit === "oz" && netUnit === "ml" ? { ...measure, unit: "fl oz", base: measure.amount * 29.5735, kind: "volume" } : measure;
  const printed = found.map(fix);

  let count: number | undefined;
  let each: Measure | undefined;
  let containerUnit: string | undefined;
  if (label) {
    const before = label.match(new RegExp(String.raw`(\d+)\s*[x×*]\s*${MEASURE}`, "i"));
    const after = label.match(new RegExp(String.raw`${MEASURE}\s*[x×*]\s*(\d+)\b`, "i"));
    const [n, amount, unit] = before ? [before[1], before[2], before[3]] : after ? [after[3], after[1], after[2]] : [];
    const measure = n && amount && unit ? toMeasure(amount, unit) : undefined;
    if (measure && Number(n) >= 2) { count = Number(n); each = fix(measure); }
    const counted = label.match(/(?:^|\s)(\d+)\s*(?:-\s*)?(pack|pk|ct|count|[a-z]+s)\b/i);
    if (!count && counted && Number(counted[1]) >= 2 && !toMeasure("1", counted[2])) {
      count = Number(counted[1]);
      containerUnit = container(counted[2]);
    }
  }

  // The label's own amount, checked against the normalized net contents.
  let chosen: Measure | undefined;
  if (count && each) chosen = { amount: tidy(count * each.amount), unit: each.unit, base: count * each.base, kind: each.kind };
  else chosen = printed.find((measure) => !net || close(measure.base, net)) ?? (net ? undefined : printed[0]);
  if (!chosen && net && netUnit) {
    const large = net >= 1000;
    chosen = { amount: tidy(large ? net / 1000 : net), unit: netUnit === "g" ? (large ? "kg" : "g") : large ? "l" : "ml", base: net, kind: netUnit === "g" ? "mass" : "volume" };
  }
  const netQuantity = net ?? chosen?.base;

  // A serving of "1 can (354.9 mL)" that divides the package evenly gives the count.
  const servingText = text(product.serving_size);
  const servingAmount = number(product.serving_quantity);
  const servingWord = servingText?.match(/^\s*1\s+([a-z]+)/i)?.[1];
  const servingContainer = container(servingWord);
  if (!count && servingContainer && netQuantity && servingAmount && servingAmount > 0) {
    const ratio = netQuantity / servingAmount;
    const whole = Math.round(ratio);
    if (whole >= 1 && whole <= 100 && close(ratio, whole, 0.04)) {
      containerUnit = servingContainer;
      if (whole >= 2) count = whole;
    }
  }

  // Packaging records: trusted only when their sizes add up to the net contents.
  const packagings = Array.isArray(product.packagings) ? (product.packagings as Json[]) : [];
  for (const entry of packagings) {
    const shape = container(text(entry.shape));
    if (!shape) continue;
    const units = number(entry.number_of_units);
    const per = text(entry.quantity_per_unit);
    const perMeasure = per ? measures(per)[0] : undefined;
    const consistent = !perMeasure || !netQuantity || close((units ?? 1) * perMeasure.base, netQuantity, 0.1);
    if (!consistent) continue;
    containerUnit ??= shape;
    if (!count && units && units >= 2 && perMeasure) {
      count = units;
      each = fix(perMeasure);
    }
    break;
  }

  if (!chosen && !count && !label) return undefined;
  const result: ProductPackage = {
    text: label,
    amount: chosen ? tidy(chosen.amount) : undefined,
    unit: chosen?.unit,
    netQuantity: netQuantity ? tidy(netQuantity) : undefined,
    netUnit: netQuantity ? netUnit ?? (chosen?.kind === "volume" ? "ml" : "g") : undefined,
    count,
    container: containerUnit ?? (count ? "each" : undefined),
  };
  if (count && chosen) {
    result.eachAmount = tidy(chosen.amount / count);
    result.eachUnit = chosen.unit;
  }
  return clean(result);
}

export function parseServing(product: Json, pack?: ProductPackage): ProductServing | undefined {
  const label = text(product.serving_size);
  const quantity = number(product.serving_quantity);
  const unitRaw = text(product.serving_quantity_unit)?.toLowerCase();
  // The printed metric amount wins when the fields disagree ("1 cup (249 g)" saved as ml).
  const printed = label ? measures(label).find((measure) => measure.unit === "g" || measure.unit === "ml") : undefined;
  let amount = printed?.amount ?? quantity;
  let unit: "g" | "ml" | undefined = printed ? (printed.unit as "g" | "ml") : unitRaw === "ml" ? "ml" : quantity ? "g" : undefined;
  if (!printed && label && !quantity) {
    const other = measures(label)[0];
    if (other) { amount = tidy(other.base); unit = other.kind === "volume" ? "ml" : "g"; }
  }
  if (!(amount && amount > 0)) { amount = undefined; unit = undefined; }
  if (!label && !amount) return undefined;
  let perPackage: number | undefined;
  if (amount && pack?.netQuantity) {
    const ratio = pack.netQuantity / amount;
    if (ratio >= 0.75 && ratio <= 1000) perPackage = Math.max(1, Math.round(ratio * 2) / 2);
  }
  return clean({ text: label, amount: amount ? tidy(amount) : undefined, unit, perPackage });
}

// ── Nutrition ───────────────────────────────────────────────────────────

function nutrients(source: Json, suffix: "_100g" | "_serving"): NutritionPer100g {
  const read = (key: string) => {
    const value = number(source[`${key}${suffix}`]);
    return value !== undefined && value >= 0 ? value : undefined;
  };
  const kj = read("energy-kj") ?? read("energy");
  const sodium = read("sodium");
  return clean({
    energyKcal: read("energy-kcal") ?? (kj !== undefined ? kj / 4.184 : undefined),
    proteinG: read("proteins"),
    carbsG: read("carbohydrates"),
    fatG: read("fat"),
    sugarsG: read("sugars"),
    fiberG: read("fiber"),
    saltG: read("salt") ?? (sodium !== undefined ? sodium * 2.5 : undefined),
  }) ?? {};
}

const scale = (values: NutritionPer100g, factor: number): NutritionPer100g =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, (value as number) * factor]));
const rounded = (values: NutritionPer100g): NutritionPer100g | undefined => {
  const entries = Object.entries(values).map(([key, value]) => [key, Math.round((value as number) * 10) / 10]);
  return entries.length ? Object.fromEntries(entries) : undefined;
};

// ── Storage ─────────────────────────────────────────────────────────────

const FREEZER_TEXT = /\b(keep|store|stored|kept)\s+frozen\b|-\s?18\s?°|\bsurgel|\bcongel/;
const FRIDGE_TEXT = /\b(keep|store|stored|kept)\s+(refrigerated|chilled|cold|in\s+(a|the|your)\s+(fridge|refrigerator))\b|\brefrigerate\b|\bbetween\s+[0-4]\s?°?\s?c?\s+and\s+[4-8]\s?°|\b[0-4]\s?°?c?\s?(-|to|and)\s?[4-8]\s?°\s?c|\bconserver au r[ée]frig|\bau frais entre/;
const NOT_FRIDGE_TEXT = /\b(do not|don't|no need to|ne pas)\s+(refrigerat|mettre au r[ée]frig)/;
const PANTRY_TEXT = /\b(cool,?\s*(and\s+)?dry|dry\s+place|room temperature|ambient|endroit (frais et )?sec|à l'abri de la chaleur)\b/;
const FRIDGE_TAGS = /\b(yogh?urts?|cheeses?|milks?|butters?|creams?|kefirs?|eggs|meats?|poultr\w*|fish(es)?|seafoods?|sausages?|hams?|tofus?|hummus|refrigerated|chilled|fresh (meats?|pastas?|cheeses?|creams?|juices?|doughs?))\b/;
const SHELF_TAGS = /\b(canned|tinned|dried|dry|uht|long life|shelf stable|powder\w*|instant|condensed|evaporated|peanut butters?|nut butters?|jerky)\b/;

function words(tag: string): string {
  return tag.toLowerCase().replace(/^[a-z]{2}:/, "").replace(/[-_]/g, " ");
}

/** Where the package should go, from its storage instructions and categories. */
export function suggestStorage(conditions: string | undefined, categories: string[] | undefined): StorageSuggestion | undefined {
  const lower = conditions?.toLowerCase() ?? "";
  const tagWords = (categories ?? []).map(words);
  if (FREEZER_TEXT.test(lower) || tagWords.some((tag) => /\bfrozen\b|\bsurgel|\bcongel/.test(tag))) return "freezer";
  // "Refrigerate after opening" is about the opened package, not this one.
  const clauses = lower.split(/[.;,\n]/).filter((clause) => !/\bopen|\bouvert|\bouverture/.test(clause));
  const unopened = clauses.join(". ");
  if (NOT_FRIDGE_TEXT.test(lower)) return "pantry";
  if (FRIDGE_TEXT.test(unopened)) return "fridge";
  if (PANTRY_TEXT.test(unopened)) return "pantry";
  if (!tagWords.length) return undefined;
  if (tagWords.some((tag) => SHELF_TAGS.test(tag))) return "pantry";
  if (tagWords.some((tag) => FRIDGE_TAGS.test(tag))) return "fridge";
  return "pantry";
}

// ── Category ────────────────────────────────────────────────────────────

// Checked against each category tag, most specific first. Pantry staples
// come before dairy so "peanut butters" isn't read as butter.
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/\b(canned|tinned)\b/, "Canned Goods"],
  [/\b(spreads?|peanut butters?|nut butters?|honeys?|jams?|marmalades?|syrups?|oils?|flours?|sugars?|baking|cocoa powders?)\b/, "Pantry"],
  [/\b(dairies|dairy|milks?|cheeses?|yogh?urts?|butters?|creams?|kefirs?|eggs)\b/, "Dairy"],
  [/\b(meats?|poultr\w*|chickens?|beef|pork|hams?|sausages?|bacon|fish(es)?|seafoods?|shrimps?|prawns?|salmons?|tunas?|turkeys?)\b/, "Meat & Seafood"],
  [/\b(breads?|bakery|baked goods|pastr\w*|buns?|bagels?|tortillas?|croissants?|muffins?)\b/, "Bakery"],
  [/\b(beverages?|drinks?|waters?|juices?|sodas?|colas?|coffees?|teas?|lemonades?|smoothies?)\b/, "Beverages"],
  [/\b(pastas?|noodles?|spaghetti|macaroni|penne|fusilli|lasagn\w*|ramen)\b/, "Pasta & Noodles"],
  [/\b(rices?|grains?|cereals?|oats?|oatmeals?|quinoa|couscous|mueslis?|granolas?)\b/, "Grains & Rice"],
  [/\b(spices?|seasonings?|herbs?|salts?)\b/, "Spices & Seasonings"],
  [/\b(condiments?|sauces?|ketchups?|mustards?|mayonnaises?|dressings?|vinegars?|salsas?|pickles?)\b/, "Condiments & Sauces"],
  [/\b(snacks?|chips|crisps|crackers?|cand(y|ies)|chocolates?|biscuits?|cookies?|bars|confectioner\w*|popcorn|nuts)\b/, "Snacks"],
  [/\b(fruits?|vegetables?|produce|salads?|legumes?|beans?|potatoes?)\b/, "Produce"],
];
// Umbrella tags that say little about the aisle ("plant-based foods and beverages").
const UMBRELLA_TAGS = /^(plant based foods( and beverages)?|beverages and beverages preparations|foods|groceries|breakfasts|meals|sweet snacks|salty snacks)$/;

/** Maps Open Food Facts category tags onto the app's category options. */
export function inferCategory(categories: string[] | undefined): string | undefined {
  if (!categories?.length) return undefined;
  const tagWords = categories.map(words);
  if (tagWords.some((tag) => /\bfrozen\b/.test(tag))) return "Frozen";
  for (const tag of [...tagWords].reverse()) {
    if (UMBRELLA_TAGS.test(tag)) continue;
    const match = CATEGORY_RULES.find(([pattern]) => pattern.test(tag));
    if (match) return match[1];
  }
  for (const tag of tagWords) {
    const match = CATEGORY_RULES.find(([pattern]) => pattern.test(tag));
    if (match) return match[1];
  }
  return "Other";
}

// ── Name and badges ─────────────────────────────────────────────────────

function cleanName(raw: string): string {
  // "Spaghetti 500 g" — the size is shown with the package.
  let name = raw.replace(new RegExp(String.raw`\s*[-–,]?\s*${MEASURE}\s*$`, "i"), "").trim() || raw;
  // Packages often print names in capitals ("DIET COKE").
  if (name.length > 3 && name === name.toUpperCase() && /[A-Z]/.test(name)) {
    name = name.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase());
  }
  return name;
}

/** Open Food Facts lists brands comma-separated, owner last ("Fairlife, The Coca-Cola Company"). */
export function primaryBrand(brands: string | undefined): string | undefined {
  return text(brands?.split(",")[0]) ?? text(brands);
}

const BADGES: Array<[string[], string]> = [
  [["en:organic", "en:eu-organic", "en:usda-organic", "en:bio"], "Organic"],
  [["en:gluten-free", "en:no-gluten"], "Gluten-free"],
  [["en:kosher"], "Kosher"],
  [["en:halal"], "Halal"],
  [["en:fair-trade", "en:fairtrade-international", "en:fair-trade-usa"], "Fair trade"],
  [["en:no-added-sugar"], "No added sugar"],
  [["en:no-gmos", "en:non-gmo-project", "en:non-gmo-project-verified"], "Non-GMO"],
];

/** Short dietary labels worth showing: vegan, organic, gluten-free and the like. */
export function productBadges(facts: Pick<ProductFacts, "labelsTags" | "ingredientsAnalysisTags"> | undefined): string[] {
  if (!facts) return [];
  const analysis = new Set(facts.ingredientsAnalysisTags ?? []);
  const labels = new Set(facts.labelsTags ?? []);
  const badges: string[] = [];
  if (analysis.has("en:vegan") || labels.has("en:vegan")) badges.push("Vegan");
  else if (analysis.has("en:vegetarian") || labels.has("en:vegetarian")) badges.push("Vegetarian");
  for (const [keys, label] of BADGES) if (keys.some((key) => labels.has(key))) badges.push(label);
  if (analysis.has("en:palm-oil-free")) badges.push("Palm oil free");
  return badges;
}

/** Tag text for display: "en:soybeans" → "soybeans". */
export function formatTag(tag: string): string {
  return tag.replace(/^[a-z]{2}:/, "").replace(/[-_]/g, " ");
}

// ── Whole product ───────────────────────────────────────────────────────

export function parseProduct(product: Json | undefined): ParsedProduct | undefined {
  if (!product) return undefined;
  const rawName = [product.product_name, product.product_name_en, product.generic_name_en, product.generic_name, product.abbreviated_product_name]
    .map(text).find(Boolean);
  if (!rawName) return undefined;
  const categoriesTags = tags(product.categories_tags);
  let pack = parsePackage(product);
  let serving = parseServing(product, pack);
  // A package smaller than one serving ("1 g" of ice cream bars) is a typo.
  if (pack?.netQuantity && serving?.amount && serving.amount > pack.netQuantity * 1.34) {
    pack = clean({ ...pack, amount: undefined, unit: undefined, netQuantity: undefined, netUnit: undefined, eachAmount: undefined, eachUnit: undefined });
    serving = parseServing(product, pack);
  }
  const nutriments = (product.nutriments && typeof product.nutriments === "object" ? product.nutriments : {}) as Json;
  let per100 = nutrients(nutriments, "_100g");
  let perServing = nutrients(nutriments, "_serving");
  if (serving?.amount) {
    if (!Object.keys(per100).length && Object.keys(perServing).length) per100 = scale(perServing, 100 / serving.amount);
    if (!Object.keys(perServing).length && Object.keys(per100).length) perServing = scale(per100, serving.amount / 100);
  }
  const conditions = text(product.conservation_conditions_en) ?? text(product.conservation_conditions);
  const perMl = text(product.nutrition_data_per) === "100ml" || pack?.netUnit === "ml";
  const facts: ProductFacts = {
    brand: text(product.brands),
    categoriesTags,
    ingredientsText: text(product.ingredients_text_en) ?? text(product.ingredients_text),
    allergensTags: tags(product.allergens_tags),
    tracesTags: tags(product.traces_tags),
    labelsTags: tags(product.labels_tags),
    ingredientsAnalysisTags: tags(product.ingredients_analysis_tags),
    nutriscoreGrade: text(product.nutriscore_grade)?.toLowerCase(),
    novaGroup: number(product.nova_group),
    ecoscoreGrade: text(product.ecoscore_grade) ?? text(product.environmental_score_grade),
    imageFrontUrl: httpsURL(product.image_front_url),
    imageFrontSmallUrl: httpsURL(product.image_front_small_url),
    imageNutritionUrl: httpsURL(product.image_nutrition_url),
    imageIngredientsUrl: httpsURL(product.image_ingredients_url),
    genericName: text(product.generic_name_en) ?? text(product.generic_name),
    packaging: pack,
    serving,
    nutritionPer100g: rounded(per100),
    nutritionPerServing: serving?.amount || Object.keys(perServing).length ? rounded(perServing) : undefined,
    nutritionBasis: per100 && Object.keys(per100).length ? (perMl ? "100ml" : "100g") : undefined,
    storage: suggestStorage(conditions, categoriesTags),
    storageText: conditions,
  };
  // "unknown" and "not-applicable" grades say nothing.
  for (const key of ["nutriscoreGrade", "ecoscoreGrade"] as const) {
    if (facts[key] && !/^[a-e]$/i.test(facts[key]!)) delete facts[key];
  }
  return { name: cleanName(rawName), category: inferCategory(categoriesTags), facts: clean(facts) ?? {} };
}

// ── Tracking choices ────────────────────────────────────────────────────

export interface PackageChoice {
  /** Amount for one package. */
  quantity: number;
  unit: string;
}

/**
 * Ways to count one package, best first: a multipack by its cans, anything
 * else by the size printed on it, then as one jar, box or bottle.
 */
export function packageChoices(pack: ProductPackage | undefined): PackageChoice[] {
  if (!pack) return [];
  const choices: PackageChoice[] = [];
  const add = (quantity: number | undefined, unit: string | undefined) => {
    if (!quantity || !unit || choices.some((choice) => choice.unit === unit)) return;
    choices.push({ quantity, unit });
  };
  if (pack.count && pack.count > 1) add(pack.count, pack.container ?? "each");
  add(pack.amount, pack.unit);
  if (!(pack.count && pack.count > 1) && pack.container && pack.container !== "each") add(1, pack.container);
  return choices;
}

export interface ImportDefaults {
  quantity?: number;
  unit?: string;
  location?: StorageSuggestion;
}

/**
 * What a scan fills in for one package: the way the household counted this
 * product last time when that's still a choice, else the best choice.
 */
export function importDefaults(facts: ProductFacts | undefined, previousUnit?: string): ImportDefaults {
  const choices = packageChoices(facts?.packaging);
  const choice = choices.find((option) => option.unit === previousUnit) ?? choices[0];
  return clean({ quantity: choice?.quantity, unit: choice?.unit, location: facts?.storage }) ?? {};
}

function clean<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined && !(Array.isArray(entry) && !entry.length));
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}
