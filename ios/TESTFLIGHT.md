# TestFlight testing notes

Each build uploaded to TestFlight gets an entry here, newest first, headed
`## <version> (<build>)`. `pnpm ios:testflight upload` copies the text under
"What to Test" into the build's **What to Test** field in App Store Connect
(bold and code formatting are dropped), so write it for testers:
plain language, under 4,000 characters, and focused on what to try and what to
confirm. Mention big fixes by name so testers can check they're gone.

## 1.1.0 (9)

What's in it: everything from 1.1.0 (8), plus fixes for cook timers that
didn't alert and a new place to see your notification settings.

### What to Test

**Cook timers always alert (fix)**
- In build 8, a timer could finish with no alarm, no notification and no
  sound. Every timer now also sends a notification with sound, and still
  rings as an alarm when alarms are allowed.
- Start a short timer, lock the phone, and wait. You should hear it and see
  "... timer is done". With alarms on, you may see both the alarm and a
  notification; tell us if that feels like too much.
- Try it with Sous Chef open, too. You should get a banner with sound.

**Notifications and timers in Settings (new)**
- Open Settings in Sous Chef. "Notifications and timers" should show
  whether Notifications, Timer alarms and Live Activities are On, Off or
  Not set up, and if notification sounds are off.
- If something isn't set up, the button there should ask for it. If
  something is off, "Change in Settings" should open Sous Chef's page in
  the Settings app. Change a switch, come back, and the status should update.

**Onboarding asks for alarms properly (fix)**
- On a fresh install, tap "Turn on notifications" at the end of onboarding.
  You should be asked about notifications and then about alarms. Before,
  the alarm question could be skipped and alarms quietly turned off.

**Cook mode warning (new)**
- With notifications and alarms both off, start a timer. Cook mode should
  say timers can only alert you inside Sous Chef, with a link to Settings.

**Dynamic Island**
- Start a timer and leave the app. Do you see the countdown in the Dynamic
  Island and on the Lock Screen? If not, check whether Live Activities shows
  Off in Sous Chef's Settings and tell us what it says.

**Please send feedback**
- Tell us whether each timer alerted, how you heard it (alarm, notification,
  or nothing), and whether the phone was locked, silent or in a Focus.
  Screenshots of the new Settings section help a lot.

## 1.1.0 (8)

What's in it: everything from 1.1.0 (7), plus a new last onboarding page
that asks for notification and alarm permission up front.

### What to Test

**Notifications page in onboarding (new)**
- Delete Sous Chef and install this build so onboarding shows again. After
  the iCloud page, a "Get a heads-up" page should explain expiry reminders
  and cook timers.
- Tap "Turn on notifications". Sous Chef should ask to send notifications,
  then to schedule alarms, and then open the app. Allow both.
- Settings > Expiry reminders should show the daily reminder already on.
- Start a cook timer. You shouldn't be asked for permission again, and the
  timer should ring like an alarm as in 1.1.0 (7).

**If you tap "Not now"**
- Reinstall and tap "Not now" on that page. Onboarding should finish
  without asking. Starting a cook timer should then ask once, as in
  1.1.0 (7), and the daily reminder should stay off until you turn it on.

## 1.1.0 (7)

What's in it: everything from 1.1.0 (6), plus cook timers that ring like
an alarm.

### What to Test

**Timers ring like an alarm (new)**
- Start any cook timer. The first time, Sous Chef asks to schedule alarms.
  Allow it.
- Put the phone on silent, lock it, and let a short timer finish. It should
  ring like a Clock app timer, through silent mode and Focus, and keep
  ringing until you stop it. The alarm should say "Step 2 is done", or the
  name you gave a custom timer, like "Rice is done".
- Tap Open on the alarm. It should stop ringing and open Sous Chef in cook
  mode. Try Stop (or swipe) too: it should just stop ringing.
- Let a timer finish with Sous Chef open. The alarm should ring on top of
  the app.
- Remove a running timer from the strip at the top. Its alarm shouldn't
  ring. Closing cook mode should also cancel its timers' alarms.
- Run two or three timers at once. Each should ring on its own, and the
  Lock Screen countdown should still list them together.

**If you don't allow alarms**
- Turn Sous Chef off under Settings > Sous Chef > Alarms (or decline the
  prompt). Timers should still alert with a notification and sound, as in
  1.1.0 (6).

## 1.1.0 (6)

What's in it: everything from 1.1.0 (5), plus a fix for a crash when tapping
a finished cook timer's notification.

### What to Test

**Tapping timer notifications (fixed)**
- Start a cook timer (a step's own timer or a custom one), leave the app or
  lock the phone, and wait for it to finish. Tap the notification. Sous Chef
  should open back in cook mode instead of crashing.
- Try it with the app open on another screen too: the banner should appear
  with sound, and tapping it shouldn't crash.
- Tap an expiry reminder notification. It should still open the Use it up
  list (or the Pantry's Use soon section from its action).

**Custom timers**
- Everything in the 1.1.0 (5) notes below still applies: the + beside a
  step's timers, "Add a timer" on other steps, the dial and quick buttons.

## 1.1.0 (5)

What's in it: everything from 1.1.0 (4), plus custom cook timers.

### What to Test

**Custom timers in cook mode (new)**
- Start cooking a recipe. On a step that mentions a time, there's a small +
  next to the "Start … timer" button. On a step without a time, there's an
  "Add a timer" button instead.
- Tap it to open the timer dial. Drag the knob around the ring to set the
  time: one full turn is an hour, and you can keep turning past it. You should
  feel a light tick for each minute.
- Try the +30s, +1m, +5m and +15m buttons and the reset button.
- Give a timer a name, like "Rice", and start it. It should count down on the
  step, in the strip at the top, on the Lock Screen and in the Dynamic Island,
  and ring when it's done.
- Start a custom timer with the same length as the step's own timer. The
  step's "Start … timer" button should still be available.

**Still worth checking**
- The step's own timers, meal planning, expiry reminders and widgets should
  work as in 1.1.0 (4).

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
