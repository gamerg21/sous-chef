# App Store release notes

The customer-facing notes for each App Store version of Sous Chef for iOS,
newest first. This file is the only source for the App Store's "What's New";
generate that copy with `pnpm ios:release-notes <version>[,<version>…]` and
don't hand-edit a different version in App Store Connect. `--full` prints every
detail line instead of the compact list.

Each version has `### New`, `### Improved` or `### Fixed` sections of entries
written as `- **Title**: what the customer can now do, notice, or retry.` Keep
titles short, since the compact App Store copy lists only them. Include
recognizable bug fixes, but never architecture, frameworks, vendors or other
implementation detail; that belongs in [CHANGELOG.md](../CHANGELOG.md).

## 1.1.0

### New
- **Plan your week**: Plan meals by day in Cook, see what each needs from your pantry, and add the week's shortages to your shopping list.
- **Custom cook timers**: Set a timer on any step with a kitchen-timer dial, quick-add buttons and an optional name.
- **Timers that ring like alarms**: Cook timers ring through silent mode and Focus until you stop them, and every timer also sends a notification.
- **Timers on the Lock Screen**: Running timers count down on the Lock Screen and in the Dynamic Island.
- **Use it up**: An optional daily reminder lists food that expires soon, and Cook's Use it up list shows recipes that use it.
- **New widgets**: Tonight's Meal, Use Soon and Shopping List widgets for the Home Screen and Lock Screen.
- **Used or thrown away**: Pantry shows how much dated food you used up or threw away this month. When something past its date runs out, choose Used or Thrown away, and it stays in your pantry as Out.

### Improved
- **Simpler Settings**: Settings is organized into a few groups, and shows whether notifications, alarms and Live Activities are on.
- **Notifications during setup**: The welcome screens explain expiry reminders and timers and ask for permission up front.
- **Fewer repeat reminders**: Expired food is mentioned until the day after its date, instead of in every reminder until you remove it.
