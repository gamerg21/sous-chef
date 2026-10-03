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
- **Used vs. thrown away:** removing an item that's past its date asks whether it
  was used up or thrown away. Cooking a dated item down to nothing counts as
  used. The inventory page shows this month's totals. Items that are removed
  before their date, or set to zero by hand, aren't counted.
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
- The used vs. thrown-away tally is web-only for now.

For widgets and other extensions, `ExpiringFood.find(in:within:now:calendar:)`
takes plain `ExpiringFood.Stock` values, and `ExpiringFood.windowDays` reads the
window from the App Group when the build has one.
