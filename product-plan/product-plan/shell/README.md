# Application Shell

## Overview

Sous Chef uses a household-first sidebar shell that makes it easy to jump between core kitchen workflows (inventory, recipes, cooking/shopping) while keeping the current section's content focused and uncluttered.

## Navigation Structure

- Kitchen Inventory → `/inventory`
- Recipes → `/recipes`
- Cooking & Shopping → `/cooking`
- Shopping List → `/shopping-list`
- Community → `/community`
- Extensions → `/extensions` (or combine with Community)
- Settings → `/settings`

## User Menu

User menu lives at the bottom of the sidebar and includes avatar/name, household context (later), **Account/Profile**, and logout.

## Layout Pattern

Left sidebar navigation with a persistent header area (brand + optional search later) and a main content area on the right for section screens.

## Responsive Behavior

- **Desktop:** Sidebar is visible and fixed; content scrolls independently.
- **Tablet:** Sidebar remains visible; spacing and typography tighten slightly.
- **Mobile:** Sidebar collapses into a hamburger drawer; navigation covers the left portion of the screen and closes after selecting a destination.

## Design Notes

- Use product design tokens (Primary: emerald, Secondary: amber, Neutral: stone) for active nav state and accents.
- Keep chrome minimal; section screens should provide the primary UI and actions.

## Components Provided

- `AppShell` — Main layout wrapper with responsive sidebar
- `MainNav` — Navigation component with icon mapping
- `UserMenu` — User menu with avatar and account/logout actions

## Props

### AppShell

- `children` — ReactNode content to render in main area
- `navigationItems` — Array of navigation items with label, href, isActive
- `user` — User object with name and optional avatarUrl
- `onNavigate` — Callback when navigation item is clicked
- `onLogout` — Callback when user logs out

