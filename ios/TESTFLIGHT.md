# TestFlight testing notes

Each build uploaded to TestFlight gets an entry here, newest first, headed
`## <version> (<build>)`. `pnpm ios:testflight upload` copies the text under
"What to Test" into the build's **What to Test** field in App Store Connect
(bold and code formatting are dropped), so write it for testers:
plain language, under 4,000 characters, and focused on what to try and what to
confirm. Mention big fixes by name so testers can check they're gone.

## 1.1.0 (4)

What's in it: everything from 1.1.0 (3), plus the security update and Finish
button shipping as 1.0.3. It protects your Sous Chef server sign-in and makes
recipe imports safer.

### What to Test

**Server connection (if you use a Sous Chef server)**
- Connect to your server and sync. Recipes, pantry, shopping list and meal
  plan should sync as before, and recipe photos you added should still appear.
- Recipes whose photo comes from another website should still show that photo.
- Connecting to a plain http:// address outside your home network, including
  an IPv6 address, should ask "Connect without encryption?" first. Home
  network addresses such as 192.168.x.x, .local names and tailnet names
  should connect without asking.
- If you already used a public http:// address, you should stay connected.

**Recipe imports**
- Import a few recipes from websites and from the share sheet. Titles,
  ingredients, steps and photos should come through as before.
- A link to a huge page or photo shouldn't freeze or close the app. Oversized
  photos are skipped, and the recipe still imports when the page has one.

**Cooking**
- Cook any recipe through to the last page and update the pantry. The Close
  button is gone; the "Finish" label at the bottom becomes a big button that
  ends cooking. Planned meals should still be marked cooked.

**Settings**
- Tap Version at the bottom of Settings. It should switch between "1.1.0" and
  "1.1.0 (4)".

**Still worth checking**
- Widgets, meal planning and expiry reminders should work as in 1.1.0 (3).

## 1.1.0 (3)

What's in it: everything from 1.1.0 (2), plus the fixes shipping in the App
Store as 1.0.2.

### What to Test

**Community recipes**
- Open Homemade Taco Seasoning and Oven-Baked Baby Back Ribs in the community.
  Drag sideways anywhere on the page; it shouldn't move left or right at all.
- Photos should still fill their frames, cropped, with no stretching, on
  recipe pages, cards and meal plan rows.

**Cooking**
- Start cooking any recipe. The small label above the ingredients title should
  say "Ingredients", not "Mise en place".

**Settings**
- Tap Version at the bottom of Settings. It should switch between "1.1.0" and
  "1.1.0 (3)". Tap again to switch back.

**Still worth checking from 1.1.0 (2)**
- Reordering recipe steps, three or more cook timers in the Dynamic Island,
  meal planning, expiry reminders and widgets (see the notes below).

## 1.1.0 (2)

What's in it: everything from 1.1.0 (1), plus reordering recipe steps, room
for three or more cook timers in the Dynamic Island, and the Mac sidebar and
fixes from 1.0.1 (6).

### What to Test

**Reordering recipe steps (new)**
- Edit a recipe with two or more steps. Tap Reorder next to the Steps heading.
  The steps should show as numbered rows with drag handles, and ingredients
  shouldn't be movable meanwhile.
- Drag a step to a new place, tap Done, then Save. Open the recipe and start
  cooking: the steps should be in the new order.
- Try it while creating a new recipe too. Reorder shouldn't appear until there
  are two steps.

**Cook timers**
- Start three or more timers while cooking, then lock the phone. The expanded
  Dynamic Island should fit all of them.

**Still worth checking from 1.1.0 (1)**
- Meal planning, expiry reminders, widgets and Lock Screen timers (see the
  1.1.0 (1) notes below).
- On a Mac, the app should open with a sidebar, and changing a recipe photo
  should still work.

## 1.1.0 (1)

What's in it: weekly meal planning, expiry reminders with a "Use it up" list,
Home Screen and Lock Screen widgets (including Tonight's Meal), and cook timers
on the Lock Screen and in the Dynamic Island.

### What to Test

**Cook timers outside the app (new)**
- Start cooking a recipe and start a timer from a step. The first time, allow
  notifications and Live Activities.
- Lock the phone or go to the Home Screen. The timer should count down on the
  Lock Screen and in the Dynamic Island, with the recipe name and step.
- Start a second timer. The one that finishes first should be shown in the
  Dynamic Island, and both should be listed on the Lock Screen.
- Let a timer finish with the phone locked. You should hear an alert and see
  "Step … timer is done". Let one finish with Sous Chef open on another screen:
  it should show a banner with sound too.
- Remove a timer in cook mode, or close cook mode. Its alert shouldn't go off,
  and the Lock Screen timer should update or disappear.

**Meal planning (new)**
- In Cook, open "This week's plan" and plan a recipe for tonight's dinner with
  a different number of servings. Cook it from the plan: the pantry should go
  down by the scaled amounts, and the meal should show as cooked.
- Try "Add week's shortages to list" twice. The second time nothing should be
  added again.

**Expiry reminders (new)**
- In Settings, pick an "expiring soon" window and turn on the daily reminder.
  On a day something expires you should get one reminder at the chosen time.
  Tapping it should open Cook's "Use it up" list; "Show in Pantry" should open
  the Pantry's "Use soon" section.

**Widgets (new)**
- Add the Tonight's Meal, Use Soon and Shopping List widgets to the Home
  Screen, and to the Lock Screen. Check they show what's in the app, and that
  they change after you edit your pantry, shopping list or meal plan.
- Tonight's Meal should show tonight's planned recipe, its servings and
  "Ready" or "Missing …". With nothing planned it should say "Nothing planned".
  After you cook the meal it should move on or go empty.
- Use Soon should list the same items as the Pantry's "Use soon" section, and
  follow the window you set in Settings.
- Tap each widget. Tonight's Meal should open the week plan (the medium size's
  "Recipe" button opens the recipe), Use Soon the Pantry's "Use soon" section,
  Shopping List the Shopping tab.
- Add an item with "Add to my Sous Chef shopping list" and check the Shopping
  List widget updates.

**Mac**
- On a Mac, cook timers should still work in the app and alert you when they
  finish.

## 1.0.1 (6)

What's in it: the App Store release candidate for 1.0.1. Adds a Mac sidebar and
fixes, plus small polish across cooking, shopping and recipe import.

### What to Test

**Cooking**
- Start cooking any recipe. The ingredients page title should count what's
  left ("Gather 5 ingredients", then "3 more to gather") and say "Ready to
  cook" once everything is checked off.
- On the Cook tab, the label above "You can cook…" should say "This morning",
  "This afternoon" or "Tonight" depending on the time.

**Putting shopping away**
- Check off a few shopping items and tap to put them away. Each item should
  show its name, amount and unit on one row. Change a unit from the menu and
  confirm it's saved in the pantry.

**Recipe import**
- Paste a link that isn't a recipe (for example a news article). After the
  error, the bottom button should say Cancel. Edit the link and it should go
  back to Import.

**Mac**
- On a Mac, the app should open without crashing, show a sidebar, and wait for
  your iCloud choice before syncing.

**Still worth checking**
- Share a recipe from Safari to Sous Chef and tap Open Sous Chef.

## 1.0.1 (5)

What's in it: builds 3 to 5 add saving recipes from other apps.

### What to Test

**Save recipes from Safari and other apps (new)**
1. Open a recipe page in Safari, such as one from Allrecipes, BBC Good Food or
   a food blog.
2. Tap Share, then Sous Chef. If Sous Chef isn't in the row of apps, scroll to
   the end, tap More, and turn it on.
3. The sheet should stay open and say "One more step". Tap **Open Sous Chef**.
4. Sous Chef should open straight into the new recipe with the title, photo,
   ingredients and steps filled in. Check them, then tap Save.

Please also try:
- Tapping **Later** instead, then opening Sous Chef yourself. The recipe
  should still be waiting for review.
- Sharing two or three recipes before opening the app. Each should come up for
  review, one after another.
- Sharing a page you've already saved. Sous Chef should open the saved recipe
  instead of importing a copy.
- Sharing recipe text, for example from Notes or Messages.
- Sharing from apps other than Safari, such as Chrome, Pinterest or Instagram.

Tell us if Open Sous Chef doesn't open the app, if a recipe comes in with
missing or wrong ingredients, or if a site doesn't work at all. Include the
link.

**Siri and Shortcuts**
- In the Shortcuts app, Sous Chef now has **Save Recipe from Link** and **Save
  Recipe from Text** actions.
- "Save this recipe to Sous Chef" is a new Siri phrase. It works in Shortcuts;
  Siri often can't pass it a link yet, so the Share sheet is the reliable way.
- "Start cooking [recipe] in Sous Chef" is no longer a Siri phrase. Start
  Cooking is still in the Shortcuts app.
