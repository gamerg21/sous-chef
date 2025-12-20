# Community & Extensions

## Overview

Community & Extensions is an optional "power-ups" area for Sous Chef. It lets households discover and install add-ons, connect third-party services, and optionally publish recipes to a community catalog.

## User Flows

- Browse extension catalog (search, categories, featured)
- View extension details and install/uninstall
- Connect/disconnect integrations (e.g., grocery delivery, cloud storage)
- Configure AI provider + API key (BYOK)
- Publish a recipe to the community (public vs unlisted)
- Browse community recipe feed (trending/recent)
- Save a community recipe into your private library

## Components Provided

- `CommunityHubView` — Main hub with featured recipes and extension marketplace
- `CommunityRecipeFeedView` — Community recipe feed/browse view
- `ExtensionCard` — Extension marketplace card
- `ExtensionDetailView` — Extension detail view with install/configure
- `IntegrationsSettingsView` — Integrations management view
- `PublishRecipeView` — Recipe publishing flow

## Callback Props

| Callback | Description |
|----------|-------------|
| `onSaveRecipe` | Called when user saves community recipe to private library |
| `onInstallExtension` | Called when user installs an extension |
| `onConnectIntegration` | Called when user connects an integration |
| `onPublishRecipe` | Called when user clicks "Publish recipe" |

