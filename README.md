# Sous Chef 🍳

Sous Chef is an **open-source, self-hostable personal kitchen assistant**.
It helps individuals and households keep their **pantry, refrigerator/freezer, recipes, and shopping** organized — all while remaining **community-first** and **privacy-respecting**.

The long-term goal is to make Sous Chef the *“do-it-all” digital sous chef* for any kitchen, without locking users into a closed ecosystem.

---

## ✨ Core Principles

* **Community-first & Open Source**
* **Self-host agnostic** (runs locally or in the cloud)
* **Offline-tolerant** mobile experience
* **Household-based** (multiple users, shared kitchen)
* **Extensible** (AI, integrations, scanners, future hardware)

---

## ✅ Current Implementation Status (April 2026)

### Implemented
* Household-scoped auth, inventory CRUD, recipes CRUD, cooking flow, shopping list CRUD
* Barcode lookup and barcode-to-food mapping support
* Shopping list barcode flow (scan -> lookup -> add/fallback) wired end-to-end
* Recipe parity features: JSON import/export and recipe photo upload/remove wiring
* Unit-system foundation (units, aliases, usage tracking) with combobox + "More units" modal
* Nutrition macros per serving in recipe model, editor, and detail views
* Community recipe publish/browse/save/like flows
* Extensions and integrations management scaffolding
* BYOK AI provider settings (configure/select/test endpoint scaffold) with encrypted key/token storage at rest
* Security hardening for password-reset token handling and household owner-role assignment guardrails

### Partial / In Progress
* Magic-link sign-in flow is not implemented yet
* AI features are still provider-config only (no fully shipped assistant workflow yet)
* Realtime sync strategy (SSE vs other realtime transports) not yet implemented

### Planned
* Offline-tolerant experience
* AI meal planning/substitutions/nutrition insights
* Manual non-barcode label scanning

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

  * Local sharing
  * Import/export
  * Optional connection to hosted community

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

### Backend (Recommended)

* **Convex** for backend APIs, data access, and realtime-friendly workflows
* Local frontend/runtime can still be self-hosted with Docker
* Backend recommendation for new deployments is Convex

See **[docs/CONVEX_SETUP.md](./docs/CONVEX_SETUP.md)** for setup guidelines.

---

## 🏠 Household Model

* One household (kitchen) per installation (for now)
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
* Encrypted secret storage for integration/provider credentials (AES-256-GCM via `APP_ENCRYPTION_KEY`)
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

## 🧪 Local Development Setup

### Prerequisites

* Node.js **20 LTS** (recommended)
* pnpm
* Convex account/deployment access

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start Convex dev backend

```bash
npx convex dev
```

Keep this running in a separate terminal while developing.

### 3. Set up environment variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env

NEXT_PUBLIC_CONVEX_URL="https://your-deployment.convex.cloud"
APP_BASE_URL="http://localhost:3000"
```

Optional (for email-based password reset delivery):

```bash
RESEND_API_KEY="your-resend-api-key"
SMTP_FROM="Sous Chef <no-reply@souschef.local>"
```

### 4. Start the development server

```bash
pnpm dev
```

The application will be available at `http://localhost:3000`.

### Additional Commands

```bash
# Type-check
pnpm type-check

# Lint
pnpm lint
```

---

## 🐳 Docker Deployment (Self-Hosting)

Sous Chef can be deployed using Docker and Docker Compose for self-hosting the app runtime.

For backend setup, the current recommendation is Convex:

- Configure Convex first via **[docs/CONVEX_SETUP.md](./docs/CONVEX_SETUP.md)**
- Then wire your Docker/runtime environment to `NEXT_PUBLIC_CONVEX_URL`

### Deployment Options

**Convex-First Docker (Recommended)**
- Use `docker-compose.convex.yml`
- Connect the app to a Convex deployment (`NEXT_PUBLIC_CONVEX_URL`)
- See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for instructions

### Quick Start (Convex-First)

1. **Download deployment files**
   - `docker-compose.convex.yml`
   - `.env.example`

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env and set required variables
   ```

3. **Set Convex URL** in `.env`
   - `NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud`

4. **Start services**
   ```bash
   docker compose -f docker-compose.convex.yml up -d
   ```

5. **Access the application**
   Open `http://localhost:3000` in your browser

### Full Documentation

- **End Users**: See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for Convex-first deployment
- **Developers**: See **[DOCKER.md](./DOCKER.md)** for Docker runtime configuration

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
* **Required contribution back** when used as a network service

See [`LICENSE`](./LICENSE) for full text.

---

## 🤝 Contributing (Early Stage)

Sous Chef is in early development.

Contributions welcome once the core foundations are stable:

* Convex schema and backend functions
* Inventory flows
* Recipe model
* Barcode ingestion

Contribution guidelines will be added soon.

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

* Web UI
* Federation / sharing improvements

---

## 🧑‍🍳 Vision

Sous Chef aims to be the *trusted digital assistant* in your kitchen —
not a data-harvesting appliance, not a walled garden, and not another abandoned recipe app.

Built **with** the community, **for** the community.
