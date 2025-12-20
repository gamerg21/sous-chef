# Milestone 6: Community & Extensions

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete, Milestone 3 (Recipes) complete

---

## About These Instructions

**What you're receiving:**
- Finished UI designs (React components with full styling)
- Data model definitions (TypeScript types and sample data)
- UI/UX specifications (user flows, requirements, screenshots)
- Design system tokens (colors, typography, spacing)
- Test-writing instructions for each section (for TDD approach)

**What you need to build:**
- Backend API endpoints and database schema
- Authentication and authorization
- Data fetching and state management
- Business logic and validation
- Integration of the provided UI components with real data

**Important guidelines:**
- **DO NOT** redesign or restyle the provided components — use them as-is
- **DO** wire up the callback props to your routing and API calls
- **DO** replace sample data with real data from your backend
- **DO** implement proper error handling and loading states
- **DO** implement empty states when no records exist (first-time users, after deletions)
- **DO** use test-driven development — write tests first using `tests.md` instructions
- The components are props-based and ready to integrate — focus on the backend and data layer

---

## Goal

Implement the Community & Extensions feature — optional community recipe discovery and publishing, plus extension marketplace and integrations.

## Overview

Community & Extensions is an optional "power-ups" area for Sous Chef. It lets households discover and install add-ons (integrations and feature extensions), connect third-party services, and optionally publish recipes to a community catalog. It also includes AI configuration using bring-your-own API keys (BYOK) for a self-hosted setup.

**Key Functionality:**
- Browse extension catalog (search, categories, featured, trusted/verified badges)
- View extension details (screenshots/description, permissions/scopes, pricing, reviews)
- Install/uninstall an extension, and enable/disable it per household
- Configure an installed extension (lightweight settings + required permissions)
- Connect/disconnect integrations (e.g., grocery delivery, cloud storage)
- Configure AI provider + API key (BYOK, per provider)
- Add/rotate API keys safely (masked display, "test connection")
- Publish a recipe to the community (public vs unlisted) and manage listing settings
- Browse community recipe feed (trending/recent)
- Save a community recipe into your private library (copy)
- Report a community listing/extension (basic moderation entry point)

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/community-and-extensions/tests.md` for detailed test-writing instructions including:
- Key user flows to test (success and failure paths)
- Specific UI elements, button labels, and interactions to verify
- Expected behaviors and assertions

The test instructions are framework-agnostic — adapt them to your testing setup (Jest, Vitest, Playwright, Cypress, RSpec, Minitest, PHPUnit, etc.).

**TDD Workflow:**
1. Read `tests.md` and write failing tests for the key user flows
2. Implement the feature to make tests pass
3. Refactor while keeping tests green

## What to Implement

### Components

Copy the section components from `product-plan/sections/community-and-extensions/components/`:

- `CommunityHubView` — Main hub with featured recipes and extension marketplace
- `CommunityRecipeFeedView` — Community recipe feed/browse view
- `CommunityRecipeCard` — Individual community recipe card
- `CommunityRecipeDetailView` — Full community recipe detail view
- `ExtensionCard` — Extension marketplace card
- `ExtensionDetailView` — Extension detail view with install/configure
- `IntegrationsSettingsView` — Integrations management view
- `IntegrationRow` — Individual integration row
- `PublishRecipeView` — Recipe publishing flow

### Data Layer

The components expect these data shapes:

```typescript
interface CommunityRecipe {
  id: string
  title: string
  description?: string
  photoUrl?: string
  tags?: string[]
  servings?: number
  totalTimeMinutes?: number
  author: { id: string; name: string; avatarUrl?: string }
  likes?: number
  savedCount?: number
}

interface ExtensionListing {
  id: string
  name: string
  description: string
  category: string
  tags?: string[]
  author: { name: string; verified?: boolean }
  pricing: 'free' | 'paid' | 'trial'
  rating?: number
  installs?: number
  permissions?: string[]
}

interface Integration {
  id: string
  name: string
  description: string
  status: 'connected' | 'disconnected' | 'error'
  scopes?: string[]
  lastSyncAt?: string
}

interface AiSettings {
  keyMode: 'bring-your-own'
  providers: AiProvider[]
  activeProviderId?: string
}
```

You'll need to:
- Create API endpoints for community recipe browsing and publishing
- Implement extension marketplace and installation system
- Handle integration OAuth flows and connection management
- Implement AI provider configuration and API key management
- Connect real data to the components

### Callbacks

Wire up these user actions:

| Callback | Description |
|----------|-------------|
| `onOpenRecipe` | Called when user clicks a community recipe — navigate to detail view |
| `onSaveRecipe` | Called when user saves community recipe to private library |
| `onOpenExtension` | Called when user clicks an extension — navigate to detail view |
| `onInstallExtension` | Called when user installs an extension |
| `onToggleExtensionEnabled` | Called when user enables/disables an extension |
| `onGoToSettings` | Called when user navigates to settings/integrations |
| `onPublishRecipe` | Called when user clicks "Publish recipe" — open publish flow |
| `onConnectIntegration` | Called when user connects an integration |
| `onDisconnectIntegration` | Called when user disconnects an integration |

### Empty States

Implement empty state UI for when no records exist yet:

- **No community recipes:** Show helpful message when feed is empty
- **No extensions:** Show message when marketplace is empty
- **No installed extensions:** Show message in installed extensions list
- **No integrations:** Show message when no integrations are configured

The provided components include empty state designs — make sure to render them when data is empty rather than showing blank screens.

## Files to Reference

- `product-plan/sections/community-and-extensions/README.md` — Feature overview and design intent
- `product-plan/sections/community-and-extensions/tests.md` — Test-writing instructions (use for TDD)
- `product-plan/sections/community-and-extensions/components/` — React components
- `product-plan/sections/community-and-extensions/types.ts` — TypeScript interfaces
- `product-plan/sections/community-and-extensions/sample-data.json` — Test data

## Expected User Flows

When fully implemented, users should be able to complete these flows:

### Flow 1: Browse and Save Community Recipe

1. User navigates to Community feed
2. User browses featured recipes or searches by tag
3. User clicks on a recipe to view details
4. User clicks "Save to Library" button
5. **Outcome:** Recipe copied to user's private library, success message shown

### Flow 2: Install an Extension

1. User navigates to Extensions marketplace
2. User browses extensions by category or searches
3. User clicks on an extension to view details
4. User reviews permissions and clicks "Install"
5. **Outcome:** Extension installed, appears in installed extensions list

### Flow 3: Connect an Integration

1. User navigates to Integrations settings
2. User clicks "Connect" on an integration (e.g., Instacart)
3. User completes OAuth flow
4. **Outcome:** Integration connected, status shows "connected", last sync time displayed

### Flow 4: Publish a Recipe

1. User navigates to Community hub
2. User clicks "Publish a recipe" button
3. User selects a recipe from their library
4. User chooses visibility (public vs unlisted)
5. User reviews and clicks "Publish"
6. **Outcome:** Recipe published to community catalog, appears in feed

### Flow 5: Configure AI Provider

1. User navigates to AI & Integrations settings
2. User selects an AI provider (e.g., Anthropic)
3. User enters API key (masked input)
4. User clicks "Test connection" to verify
5. User sets provider as active
6. **Outcome:** AI provider configured and ready to use

## Done When

- [ ] Tests written for key user flows (success and failure paths)
- [ ] All tests pass
- [ ] Components render with real data
- [ ] Empty states display properly when no records exist
- [ ] Community recipe browsing and saving works
- [ ] Extension marketplace and installation works
- [ ] Integration OAuth flows work
- [ ] AI provider configuration works
- [ ] Recipe publishing works
- [ ] User can complete all expected flows end-to-end
- [ ] Matches the visual design
- [ ] Responsive on mobile

**Note:** This section is optional and can be disabled for strictly private, self-hosted use. Consider making it feature-flag configurable.

