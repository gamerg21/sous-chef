# Sous Chef 🍳

Sous Chef is an **open-source, self-hostable personal kitchen assistant**.
It helps individuals and households keep their **pantry, refrigerator/freezer, recipes, and shopping** organized — all while remaining **community-first** and **privacy-respecting**.

The long-term goal is to make Sous Chef the *“do-it-all” digital sous chef* for any kitchen, without locking users into a closed ecosystem.

---

## Start here

Sous Chef uses **Convex**, either hosted by Convex or on your own infrastructure. The web app is the current product; native companion apps and a managed paid service are future possibilities.

1. Follow [Convex setup](docs/CONVEX_SETUP.md) to initialize auth, deploy functions, and seed units.
2. Run locally with `pnpm dev`, or follow [the home-server Docker guide](DEPLOYMENT.md).
3. Create your account and add your first pantry items. No AI key or mail provider is needed for the core kitchen flows.

Run `pnpm run doctor` to check local configuration and backend reachability. The app shows setup instructions when its backend URL is missing. Docker reads the URL at runtime, so one image can connect to any configured Convex instance.

## Current scope

- Household inventory, recipe editing/import/export, photos, nutrition fields, ingredient matching, unit-aware cooking, and a shared shopping list.
- Barcode lookup through Open Food Facts, with camera scanning on trusted HTTPS.
- Household membership/roles and a working kitchen switcher.
- Convex realtime subscriptions, responsive web layouts, and accessible scrollable dialogs.
- Email/password signin and recovery by email, or operator-assisted recovery when email is not configured.
- Community recipe sharing within a deployment; optional AI provider configuration with encrypted keys.

**Still unfinished:** AI assistant/meal planning, third-party grocery/calendar integrations, magic links, offline operation, cross-instance community federation, and native apps. Existing extension/provider settings should not be mistaken for completed end-user workflows.

Validation commands: `pnpm test`, `pnpm type-check`, `pnpm lint`, and `pnpm build`.

---

## 🧠 What Sous Chef Does

### Inventory Management

* Pantry / fridge / freezer tracking
* **Unit-level quantities** (e.g., 2 eggs, 500g rice)
* **Expiration dates per item instance**
* Photo attachments
* Barcode scanning (UPC/EAN)
* Manual label scanning for non-barcode foods (planned)

### Recipes

* Private by default, **shareable with the community**
* Ingredient-to-inventory mapping
* Nutrition macros per serving
* Photos and notes (recipe detail upload/remove implemented)
* Recipe import/export (JSON)

### Cooking & Planning

* “Cook recipe” flow automatically deducts inventory
* Missing ingredients go to shopping list
* Shopping list supports manual adds and barcode scanning

### Community Recipes

* Recipes can be published to a **public community catalog**
* Self-hosted users retain full functionality via:

  * Sharing within their own deployment
  * Import/export
  * A hosted community connection is future work

### AI (Optional)

* BYOK provider configuration is available
* Meal planning, substitutions, and nutrition insights are planned/in progress
* **Self-hosted**: user-supplied API keys only

---

## 🏗️ Architecture Overview

Sous Chef is intentionally designed to avoid vendor lock-in.

### Frontend
* Next.js web application
* React 19 with TypeScript
* Tailwind CSS for styling

### Backend

* **Convex** for backend APIs, data access, and realtime-friendly workflows
* Local frontend/runtime can still be self-hosted with Docker
* Convex is the application backend; it can also be self-hosted

See **[docs/CONVEX_SETUP.md](./docs/CONVEX_SETUP.md)** for setup guidelines.

---

## 🏠 Household Model

* Multiple households (kitchens), with an active kitchen per user
* Multiple users per household
* Roles:

  * `owner`
  * `admin`
  * `member`

All inventory and recipes are scoped to a household.

---

## 🔐 Authentication & Security

* Convex Auth (`@convex-dev/auth`)
* Email/password authentication
* Password reset via email delivery provider integration
* Password-reset token response hardening
* Household role guardrails (only owners can assign owner role)
* Encrypted secret storage for integration/provider credentials (AES-256-GCM via `SECRETS_ENCRYPTION_KEY`)
* Household-based access control
* Self-hosters fully control auth + app runtime configuration

---

## 📦 Project Structure

```
sous-chef/
├─ src/                 # Next.js application source
├─ convex/              # Convex backend functions and schema
│  ├─ schema.ts
│  └─ _generated/
├─ public/              # Static assets
├─ scripts/             # Utility scripts
└─ README.md
```

---

## Run and deploy

- [First-run and Convex setup](docs/CONVEX_SETUP.md)
- [Home-server deployment](DEPLOYMENT.md)
- [Docker configuration reference](DOCKER.md)
- [Implementation and UX review](docs/APP_REVIEW.md)

Use Node.js 22 and the pinned pnpm version. The frontend uses Next.js and React; Convex owns backend data, auth, files, and realtime updates. See the setup guide for the full sequence, including auth keys and the units catalog.

---

## 🗄️ Data Model Philosophy

* Convex is the source of truth for backend data and business logic
* Strongly typed function contracts between frontend and backend
* Designed for inventory instances, expiration tracking, nutrition data, and recipe sharing

---

## 📜 License

Sous Chef is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This ensures:

* Freedom to self-host
* Freedom to modify
* **Corresponding source availability requirements** when used as a network service

See [`LICENSE`](./LICENSE) for full text.

---

## 🤝 Contributing (Early Stage)

Sous Chef is in early development.

Contributions welcome once the core foundations are stable:

* Convex schema and backend functions
* Inventory flows
* Recipe model
* Barcode ingestion

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 🚧 Roadmap (High-Level)

**Phase 1**

* Auth + household bootstrap
* Inventory CRUD
* Barcode scan → add item

**Phase 2**

* Recipes + cooking flow
* Shopping list automation

**Phase 3**

* Community recipes
* AI meal planning (optional)

**Phase 4**

* Native companion apps (future)
* Federation / sharing improvements

---

## 🧑‍🍳 Vision

Sous Chef aims to be the *trusted digital assistant* in your kitchen —
not a data-harvesting appliance, not a walled garden, and not another abandoned recipe app.

Built **with** the community, **for** the community.
