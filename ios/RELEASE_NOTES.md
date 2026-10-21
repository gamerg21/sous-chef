# App Store release notes

The customer-facing notes for each App Store version of Sous Chef for iOS,
newest first. This file is the only source for the App Store's "What's New";
generate that copy with `pnpm ios:release-notes <version>[,<version>…]` and
don't hand-edit a different version in App Store Connect. `--full` prints every
detail line instead of the compact list.

Each version has `### New`, `### Improved` or `### Fixed` sections of entries
written as `- **Title**: what the customer can now do, notice, or retry.` Keep
titles short, since the compact App Store copy lists only them. A feature
release can instead open with an `### App Store` section: written copy that
highlights the release, printed as-is in place of the list of titles. Include
recognizable bug fixes, but never architecture, frameworks, vendors or other
implementation detail; that belongs in [CHANGELOG.md](../CHANGELOG.md).

## 1.1.1

### App Store
Fixed: recipes pasted as structured recipe data, like the kind AI chat apps write, now come in with their steps, servings, time and nutrition instead of one step per line.

### Fixed
- **Pasted recipe data**: Recipes pasted as structured recipe data, like the kind AI chat apps write, now come in with their steps, servings, time, nutrition and tips instead of one step per line.

## 1.1.0

### App Store
Households are here! Share your kitchen with family or roommates so everyone can pitch in, see what's in stock and know what's for dinner. Invite someone from Settings > Household, and changes sync through iCloud in moments.

Also new in 1.1:
• Plan your week: plan meals by day, then add whatever's missing to your shopping list in one go.
• Timers that ring: Sous Chef finds the timers in your recipe steps, so you can start one with a tap while you cook, or set your own. They ring like alarms, even in silent mode, and count down on the Lock Screen.
• Use it up: an optional daily reminder of food that expires soon, with recipes that use it.
• New widgets: tonight's meal, food to use soon and your shopping list on your Home Screen and Lock Screen.
• Shake to undo: deleted something by mistake? Shake your iPhone to bring it back.

Plus a monthly count of food used and thrown away, simpler Settings, better cookbook scans, and fixes for cooking across units and recipe edits.

### New
- **Share your kitchen**: Invite family to your kitchen from Settings. Everyone in the household sees and edits the same pantry, recipes, shopping list and meal plan, synced through iCloud. Each person needs an iPhone, iPad or Mac and their own Apple ID.
- **Plan your week**: Plan meals by day in Cook, see what each needs from your pantry, and add the week's shortages to your shopping list.
- **Custom cook timers**: Set a timer on any step with a kitchen-timer dial, quick-add buttons and an optional name.
- **Timers that ring like alarms**: Cook timers ring through silent mode and Focus until you stop them, and every timer also sends a notification. If you don't allow alarms, timer notifications still come through Focus as Time Sensitive.
- **Timers on the Lock Screen**: Running timers count down on the Lock Screen and in the Dynamic Island, show when they'll be done, and say "Done" when they finish, even if you stop the alarm without opening Sous Chef. Long timers read like "2 hr, 59 min", and with four or more timers the Lock Screen shows how many more are running.
- **Use it up**: An optional daily reminder lists food that expires soon, and Cook's Use it up list shows recipes that use it.
- **New widgets**: Tonight's Meal, Use Soon and Shopping List widgets for the Home Screen and Lock Screen.
- **Shake to undo**: Deleted something by mistake? Shake your iPhone to bring it back. You can also turn on an Undo button in Settings.
- **Used or thrown away**: Pantry shows how much dated food you used up or threw away this month. When something past its date runs out, choose Used or Thrown away, and it stays in your pantry as Out. Food that runs out drops its old expiry date, so restocking it starts fresh.

### Improved
- **Simpler Settings**: Settings is organized into a few groups, and shows whether notifications, alarms and Live Activities are on.
- **Notifications during setup**: The welcome screens explain expiry reminders and timers and ask for permission up front.
- **Fewer repeat reminders**: Expired food is mentioned until the day after its date, instead of in every reminder until you remove it.

### Fixed
- **Better cookbook scans**: Scanning a cookbook page keeps each ingredient and step on one line, handles side-column ingredients, uses the intro as the description instead of step 1, and fills in servings, time and nutrition.
- **Recipe edits stay put**: Swiping down on a recipe you're adding or editing no longer closes it and loses your changes. Tap Cancel to discard them.
- **Cooking across units**: Cooking a recipe in grams from a pack in pounds, or in millilitres from a cup, uses up the pack instead of leaving a sliver or asking for a little more. Cook also warns when food that expires soon is measured in a unit the recipe can't use.
