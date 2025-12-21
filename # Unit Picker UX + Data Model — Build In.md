# Unit Picker UX + Data Model — Build Instructions (Sous Chef)

## Goal
Build a **recipe ingredient unit selector** that:
- Supports a **large unit catalog** (metric + imperial + packages + qualitative)
- Feels **simple and fast** for users (mobile-first)
- Avoids a “giant dropdown”
- Improves over time using **ingredient context + user behavior**

Success criteria:
- Users can add most ingredients with **1–2 taps**.
- Unit selection rarely requires scrolling.
- Search is fast and forgiving (aliases, abbreviations, typos).
- Units are structured so conversions are possible where appropriate.

---

## UX Requirements

### 1) No static mega-dropdown
The Unit field must be a **combobox** (type-ahead + suggestions), not a long `<select>` list.

**UI layout per ingredient row**
- Ingredient name input
- Amount input (numeric)
- Unit field (combobox)

Example:
- `0.5` + `each ▾`

### 2) Default suggestions (Top units)
When the unit field is focused and empty, show a **small suggestion list** (8–10 max) based on:
1) Ingredient-based recommendations (if available)
2) User recent usage (boost)
3) Global defaults fallback

### 3) Ingredient-aware unit suggestions
Unit suggestions must be **contextual** to the ingredient name and/or mapped ingredient category.

Examples:
- Onion → `each`, `cup (chopped)`, `slice`
- Milk → `cup`, `mL`, `L`, `fl oz`
- Salt → `tsp`, `tbsp`, `pinch`, `to taste`
- Butter → `tbsp`, `stick`, `g`, `oz`

Implementation note:
- Ingredient context can come from:
  - Inventory item mapping (preferred)
  - Ingredient category (produce/dairy/spice/etc.)
  - Keyword heuristics (fallback)

### 4) “More units…” is a secondary screen
After the short suggestions list, show a final option:
- **“More units…”**

This opens a **grouped modal/sheet**, not a longer dropdown.

Group headings (minimum):
- Volume (US)
- Volume (Metric)
- Weight (US)
- Weight (Metric)
- Countables
- Packages
- Qualitative (e.g., “to taste”)

### 5) Search behavior
Unit search must support:
- Abbreviations: `tsp`, `tbsp`, `oz`, `lb`, `ml`, `l`
- Common synonyms: `ea` → `each`, `c` → `cup`, `fl` → `fl oz`
- Case-insensitive matching
- Optional: basic typo tolerance (nice-to-have)

### 6) Qualitative quantities are supported
Units like:
- `to taste`, `as needed`, `for garnish`, `optional`

These should not break validation:
- Amount may be empty or ignored when unit type is `qualitative`
- UI should not force numeric input in these cases

### 7) Remember user habits
Persist “recently used units” and “unit usage by ingredient”:
- Recent units list (global for the user)
- Per-ingredient unit preference (when ingredient is mapped/canonical)

Use these to re-rank suggestions.

---

## Data Model Requirements

### Core concept: units have types
Every unit must have a `unit_type`:
- `count`
- `volume`
- `mass`
- `length`
- `time`
- `temperature`
- `package`
- `qualitative`

Only allow conversions **within the same type** (e.g., volume ↔ volume).

### Tables / Entities (suggested)

#### `units`
Fields:
- `id` (uuid)
- `name` (string) — canonical display name (e.g., “tablespoon”)
- `abbr` (string|null) — e.g., “tbsp”
- `unit_type` (enum)
- `system` (enum) — `us`, `metric`, `neutral`
- `base_unit_id` (uuid|null) — for convertible types
- `to_base_factor` (decimal|null) — multiplier to convert to base
- `is_common` (bool) — for global top suggestions
- `is_enabled` (bool)

Notes:
- For each `unit_type`, define a base unit:
  - volume base: `milliliter`
  - mass base: `gram`
  - length base: `millimeter` or `centimeter`
  - time base: `second`
  - temperature: store as a separate type (conversion requires formula, not factor)

#### `unit_aliases`
Fields:
- `id`
- `unit_id`
- `alias` (string) — e.g., “tsp.”, “ts”, “teaspoon”, “tea spoon”, “c”, “cups”
- `priority` (int) — helps pick best match for ambiguous aliases

Purpose:
- Search matches aliases, returns canonical unit.

#### `ingredient_unit_profiles` (optional but recommended)
Fields:
- `ingredient_key` (string or foreign key to canonical ingredient)
- `recommended_unit_ids` (array or join table)
- `default_unit_id` (uuid|null)

This powers the “ingredient-aware” suggestions.

#### `user_unit_usage`
Fields:
- `user_id`
- `unit_id`
- `count`
- `last_used_at`

#### `user_ingredient_unit_preference` (nice-to-have)
Fields:
- `user_id`
- `ingredient_key`
- `unit_id`
- `count`
- `last_used_at`

---

## Suggestion Ranking Algorithm (required)

When unit picker opens, compute suggestions in this order:

1. **Ingredient default** (if exists) — pinned at top
2. **Ingredient recommended list** (if exists)
3. **User’s recent units** (top 3–5, if not already included)
4. **Global common units** (`is_common=true`) to fill up to 8–10

De-dupe by `unit_id`.

Search results should override ranking:
- If user types, show best matches by alias relevance + usage boost.

---

## UI Implementation Notes

### Combobox behaviors
- Enter selects highlighted suggestion
- Esc closes suggestions
- Keyboard + mobile friendly
- Selecting a unit updates the row immediately

### “More units…” modal
- Grouped list with headings
- Search bar at top
- Selecting a unit closes modal and populates the field

### Accessibility
- Use ARIA combobox patterns
- Ensure focus management works:
  - Open suggestions on focus
  - Return focus to unit field after selection

---

## Validation Rules

### Numeric amount
- Required for unit types: `count`, `volume`, `mass`, `length`, `time`
- Optional for: `qualitative` (and possibly `package` depending on design)
- Support decimals: `0.5`, `1.25`

### Fraction support (nice-to-have)
- Allow user to type `1/2` and normalize to `0.5` internally
- Display can remain `0.5` or formatted as `½` later

---

## Seed Data Requirements (minimum)

### Must-have units (v1)
Count:
- `each`, `clove`, `slice`, `bunch`, `sprig`, `stick`

Volume (US):
- `teaspoon`, `tablespoon`, `cup`, `fluid ounce`, `pint`, `quart`, `gallon`

Volume (Metric):
- `milliliter`, `liter`

Mass (US + Metric):
- `ounce`, `pound`, `gram`, `kilogram`

Temp:
- `Fahrenheit`, `Celsius`

Time:
- `minute`, `hour`

Packages:
- `can`, `jar`, `bottle`, `box`, `bag`, `package`

Qualitative:
- `to taste`, `as needed`, `for garnish`, `optional`

### Alias requirements (examples)
- teaspoon: `tsp`, `tsp.`, `teaspoon`, `teaspoons`
- tablespoon: `tbsp`, `tbsp.`, `T`, `tablespoon`, `tablespoons`
- cup: `c`, `cup`, `cups`
- milliliter: `ml`, `mL`, `millilitre`
- ounce: `oz`, `oz.`
- pound: `lb`, `lbs`, `#`

---

## What NOT to do
- Do not show all units in a single dropdown list.
- Do not force users to pick a unit before they can continue (default it).
- Do not attempt cross-type conversions (e.g., “cups to grams”) without density rules.
- Do not hardcode unit strings in the UI; use canonical `units` + `unit_aliases`.

---

## Testing Checklist

### UX
- Can add “0.5 onion” with 2 taps (amount + unit default each)
- Unit picker opens fast, suggestions are short
- Search: typing `tbsp` shows tablespoon first
- “More units…” modal is grouped and searchable

### Data correctness
- Units are uniquely canonical
- Aliases map correctly
- Suggestion ranking de-dupes and is stable

### Edge cases
- “salt to taste” works without numeric amount
- Switching ingredient updates unit suggestions (but doesn’t overwrite user-selected unit unless empty)

---

## Deliverables
1. Unit data model + seed migration
2. Combobox component + “More units” grouped modal
3. Suggestion ranking function
4. Basic unit usage tracking (recent units)
5. Tests for alias search + ranking

---

## Questions / Decisions to confirm (leave TODOs in code)
- Should `package` units require numeric amount? Yes 
- Do we store “cup (chopped)” as a separate unit or as a unit + preparation modifier? Preparation modifier, but this will be in the description of the recipe, we dont need an extra field
- How deep do we go on fraction parsing in v1? Lets cover the basics for now to have a good system in place, supporting the most common fractions. 
