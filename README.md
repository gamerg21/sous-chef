# Sous Chef 🍳

Sous Chef is an **open-source, self-hostable personal kitchen assistant**.
It helps individuals and households keep their **pantry, refrigerator/freezer, recipes, and shopping** organized — all while remaining **community-first** and **privacy-respecting**.

The long-term goal is to make Sous Chef the *“do-it-all” digital sous chef* for any kitchen, without locking users into a closed ecosystem.

---

## Start here

Sous Chef uses **Convex**, either hosted by Convex or on your own infrastructure. The web app is the current product; native companion apps and a managed paid service are future possibilities.

**Home server, one command.** With Docker installed, `./homelab.sh up` starts the open-source Convex backend, configures it, and serves the app on your LAN. No Convex account, no keys to paste. See [Run Sous Chef at home](DEPLOYMENT.md).

**Developing:**

1. Follow [Convex setup](docs/CONVEX_SETUP.md) to initialize auth, deploy functions, and seed units.
2. Run locally with `pnpm dev`.
3. Create your account and add your first pantry items. No AI key or mail provider is needed for the core kitchen flows.

Run `pnpm run doctor` to check local configuration and backend reachability. The app shows setup instructions when its backend URL is missing. Docker reads the URL at runtime, so one image can connect to any configured Convex instance.

## Current scope

- Household inventory, recipe editing/import/export, photos, nutrition fields, ingredient matching, unit-aware cooking, and a shared shopping list.
- Barcode lookup through Open Food Facts, with camera scanning on trusted HTTPS.
- Household membership/roles and a working kitchen switcher.
- Convex realtime subscriptions, responsive web layouts, and accessible scrollable dialogs.
- Email/password signin and recovery by email, or operator-assisted recovery when email is not configured.
- Community recipe sharing within a deployment; optional pantry-to-recipe drafts using your own AI provider key.

**Still unfinished:** Conversational AI/meal planning, third-party grocery/calendar integrations, magic links, offline operation, cross-instance community federation, and native apps. Pantry recipe drafts work with a configured provider. The extension catalog is a preview: listings cannot be installed, integrations cannot be connected, and neither appears in the main navigation.

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

* Private by default, **shareable with other households on your instance**
* Ingredient-to-inventory mapping
* Nutrition macros per serving
* Photos and notes (recipe detail upload/remove implemented)
* Recipe import/export (JSON)

### Cooking & Planning

* “Cook recipe” flow automatically deducts inventory
* Missing ingredients go to shopping list
* Shopping list supports manual adds and barcode scanning

### Community Recipes

* Recipes can be published as public or unlisted to the **community catalog of your own instance**
* Sharing stays within one deployment; import/export moves recipes between instances
* Connecting instances to each other or to a hosted community is future work

### AI (Optional)

* New recipe → **Idea from pantry** generates one editable recipe draft.
* Configure OpenAI, Anthropic, or Google AI, an exact model ID, and your own API key under **AI settings** (open the account menu).
* The Generate button sends pantry names, quantities, units, and preferences to that provider; your provider may bill the request. Nothing is saved automatically.
* Set `SECRETS_ENCRYPTION_KEY` on Convex before saving new provider keys.
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

- [Run Sous Chef at home](DEPLOYMENT.md): `./homelab.sh up` for everything on your hardware, or Convex Cloud plus a local web container
- [Docker configuration reference](DOCKER.md)
- [First-run and Convex setup for development](docs/CONVEX_SETUP.md)
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

See [CONTRIBUTING.md](CONTRIBUTING.md). Agent guidance is in [AGENTS.md](AGENTS.md);
all 39 installed Convex skills and their local adaptations are documented in
[the skills guide](.agents/skills/README.md). Run `pnpm run check:docs` to verify
local documentation links and skill installation integrity.

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

## Back up your kitchen

On a home server, `./homelab.sh backup` exports into `./backups/`. For a development checkout, run `pnpm run backup --deployment dev` (or explicitly select `prod`, `local`, or a deployment name). The command exports tables and uploaded files into the git-ignored `.backups/` directory with private file permissions. Keep a separate secure copy of deployment environment values, particularly auth signing and encryption keys. See [backup and restore](docs/BACKUP.md) for a restore drill.
