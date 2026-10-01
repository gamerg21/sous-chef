# TestFlight testing notes

Each build uploaded to TestFlight gets an entry here, newest first, headed
`## <version> (<build>)`. `pnpm ios:testflight upload` copies the text under
"What to Test" into the build's **What to Test** field in App Store Connect
(bold and code formatting are dropped), so write it for testers:
plain language, under 4,000 characters, and focused on what to try and what to
confirm. Mention big fixes by name so testers can check they're gone.

## 1.0.3 (1)

What's in it: a security update for 1.0.2. It protects your Sous Chef server
sign-in and makes recipe imports safer. Nothing else changes.

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
- Disconnect, then connect again; it should work normally.

**Recipe imports**
- Import a few recipes from websites and from the share sheet. Titles,
  ingredients, steps and photos should come through as before.
- A link to a huge page or photo shouldn't freeze or close the app. Oversized
  photos are skipped, and the recipe still imports when the page has one.

**Settings**
- Tap Version at the bottom of Settings. It should switch between "1.0.3" and
  "1.0.3 (1)".

## 1.0.2 (8)

What's in it: the App Store release candidate for 1.0.2, a small fix-up
release on top of 1.0.1.

### What to Test

**Community recipes**
- Open Homemade Taco Seasoning and Oven-Baked Baby Back Ribs in the community.
  Drag sideways anywhere on the page; it shouldn't move left or right at all.
- Photos should still fill their frames, cropped, with no stretching.

**Cooking**
- Start cooking any recipe. The small label above the ingredients title should
  say "Ingredients", not "Mise en place".

**Settings**
- Tap Version at the bottom of Settings. It should switch between "1.0.2" and
  "1.0.2 (8)". Tap again to switch back.

## 1.0.2 (7)

What's in it: a small App Store fix for 1.0.1. Cook mode no longer says
"Mise en place", and one community recipe no longer drags left and right.

### What to Test

**Cooking**
- Start cooking any recipe. The small label above the ingredients title should
  say "Ingredients", not "Mise en place".

**Recipe photos**
- Open Homemade Taco Seasoning in the community. The page should only scroll up
  and down; dragging sideways shouldn't move it.
- Open a few other community recipes and your own recipes. Photos should still
  fill their frames, cropped, with no stretching.

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
