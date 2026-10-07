# Expiry reminders

Sous Chef points out food that's about to expire and suggests recipes that use
it up. "Expiring soon" means an item that is in stock (quantity above zero)
and expires within the cook's window, 3 days unless changed, including items
already past their date. Days are calendar days in the cook's time zone. The web
rules live in `src/lib/expiring.ts`; the iOS app mirrors them in
`ios/Shared/ExpiringFood.swift`.

## On the web

- **Inventory:** a "Use it up" card lists what's expiring, with links to the
  inventory filter and to cooking. The "Expiring soon" count uses the same window.
- **What can I cook?:** the **Use it up** filter keeps recipes that use expiring
  items and ranks them by how many they use, then the soonest date, then the
  chosen sort (readiness for "Recent"). Each card shows the expiring items it uses.
  Matching reuses the cooking plan, so it follows ingredient mappings and
  units exactly as cooking does. `/cooking?filter=expiring` opens the filter.
- **Used vs. thrown away:** an expired item in the "Use it up" card has **Used**
  and **Thrown away** buttons. Either records the outcome and keeps the item as
  out of stock (quantity 0), so it can go back on the shopping list. Removing an
  expired item that's in stock asks the same question with the same result;
  removing it again once it's out deletes it.
  Setting a dated item's quantity to 0 in the item editor counts it as used
  before its date and asks the same question once it's past, as on iOS.
  Cooking a dated item down to nothing counts as used. The inventory page shows
  this month's totals. An item that's already out isn't counted again, and items
  removed before their date aren't counted.
- **Out items have no date:** an item that runs out, however it happens, loses
  its expiry date; the recorded outcome keeps it. Restocking the item asks for a
  new date. Dates left on items that were already out are cleared when the
  server starts.
- **Settings → Account & preferences → Expiry reminders:** the window (1, 2, 3, 5
  or 7 days).

## On iPhone and iPad

- **Pantry:** "Use soon" lists expiring items using the same window.
- **Cook:** **Use it up** ranks recipes by how many expiring items they use,
  then the soonest date, then readiness. Each row names the items and when they
  expire.
- **Settings → Expiry reminders:** the window and an opt-in daily reminder at a
  chosen time (09:00 by default). The app asks for notification permission only
  when the reminder is turned on.
- Reminders are local notifications. The app schedules one notification for each
  of the next 14 days that has something expiring, using that day's list, such
  as "Milk and spinach expire in 2 days." Days with nothing expiring get no
  notification. The schedule is rebuilt when the pantry changes and when the app
  opens or goes to the background, so opening the app now and then keeps it
  current. Tapping a reminder opens Cook's "Use it up" list; **Show in Pantry**
  opens the Pantry's "Use soon" section.
- **Used vs. thrown away:** the Pantry shows "This month: N used · N thrown
  away". Running a dated item out by hand (the **Use** swipe, the item editor or
  "I ran out of…" in Siri) counts it as used when it's not past its date. When
  it is past its date, the app asks **Used** or **Thrown away** instead; the
  item's menu offers the same choice, and so does deleting it while it's in
  stock. Either way the item stays as **Out**, without its old date.
  Siri can't ask, so an expired item it empties isn't counted. Cooking a dated
  item to nothing counts as used. Outcomes sync through iCloud and, when
  connected, with the server (`expiry:record` and `expiry:list`), so the web and
  iOS tallies agree.
- Reminders mention expired food through the day after its date ("expired
  yesterday"), then stop, so the same item isn't repeated every day. The rule
  is `ExpiringFood.reminderItems` on iOS and `findReminderItems` on the web.

For widgets and other extensions, `ExpiringFood.find(in:within:now:calendar:)`
takes plain `ExpiringFood.Stock` values, and `ExpiringFood.windowDays` reads the
window from the App Group when the build has one.
