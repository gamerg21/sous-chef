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

## ✅ Current Implementation Status (March 2, 2026)

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
* Magic link auth provider is configured, but sign-in UI currently uses password flow
* AI features are still provider-config only (no fully shipped assistant workflow yet)
* Realtime sync strategy (SSE vs Supabase realtime) not yet implemented

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

### Backend (Initial / Agnostic)

* **Supabase-compatible stack**
  * PostgreSQL
  * Storage (photos, labels)
  * Realtime (planned)
* Local development via Docker

### Why Supabase First?

* Self-hostable
* Open source core
* PostgreSQL + SQL migrations
* Strong Row Level Security (RLS)
* Fast MVP velocity

This backend can later be swapped or extended without rewriting the app logic.

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

* NextAuth.js with Prisma adapter
* Email/password authentication
* Magic link provider configured (sign-in UI flow in progress)
* Password-reset token response hardening
* Household role guardrails (only owners can assign owner role)
* Encrypted secret storage for integration/provider credentials (AES-256-GCM via `APP_ENCRYPTION_KEY`)
* PostgreSQL database (Supabase-compatible)
* Household-based access control
* Self-hosters fully control auth + storage

---

## 📦 Project Structure

```
sous-chef/
├─ src/                 # Next.js application source
├─ prisma/              # Prisma schema and migrations
│  ├─ schema.prisma
│  └─ migrations/
├─ supabase/            # Supabase local development config
│  ├─ migrations/       # SQL migrations
│  ├─ config.toml
│  └─ storage/
├─ public/              # Static assets
├─ scripts/             # Utility scripts
└─ README.md
```

---

## 🧪 Local Development Setup

### Prerequisites

* Node.js **20 LTS** (recommended)
* pnpm
* Docker (required for Supabase local development)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start Supabase locally

```bash
# Initialize Supabase (if not already done)
pnpm supabase init

# Start Supabase services (PostgreSQL, Auth, Storage, etc.)
pnpm supabase start

# Check status and get connection details
pnpm supabase status
```

After running `supabase status`, you'll see connection details including the database URL.

### 3. Set up environment variables

Create a `.env` file in the root directory with the following variables:

```bash
# CLI dev env (Supabase CLI + pnpm dev)
cp env.cli.example .env

# Get the database URL from: pnpm supabase status
# It will look like: postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# NextAuth secret (generate a random string)
# You can generate one with: openssl rand -base64 32
NEXTAUTH_SECRET="your-secret-key-here"

# App encryption key (used to encrypt provider API keys/tokens at rest)
# Generate one with: openssl rand -base64 32
APP_ENCRYPTION_KEY="your-32-byte-base64-key"

# NextAuth URL (for local development)
NEXTAUTH_URL="http://localhost:3000"

# Canonical application URL used for password reset links
APP_BASE_URL="http://localhost:3000"
```

### Docker Compose dev/test (build from source)

If you want to test the Docker build/Compose setup **without interfering** with CLI local dev, use a separate env file and different ports:

```bash
cp env.docker.example .env.docker

# Runs the app on http://localhost:3001 and Postgres on localhost:5433 by default
pnpm docker:up
```

Stop and delete volumes (⚠️ deletes Docker DB data):

```bash
pnpm docker:down
```

### 4. Run database migrations

```bash
# Run Prisma migrations to set up the database schema
# This will also generate the Prisma client automatically
pnpm prisma migrate dev

# If you need to generate the Prisma client separately (e.g., after schema changes)
pnpm prisma generate
```

**Note for Windows users:** If you encounter a symlink permission error when running `prisma generate`, see [docs/WINDOWS_SETUP.md](./docs/WINDOWS_SETUP.md) for solutions.

### 5. Start the development server

```bash
pnpm dev
```

The application will be available at `http://localhost:3000`.

### Additional Commands

```bash
# View Supabase Studio (database admin UI)
# Open: http://localhost:54323

# Stop Supabase services
pnpm supabase stop

# Reset Supabase (clears all data)
pnpm supabase db reset
```

---

## 🐳 Docker Deployment (Self-Hosting)

Sous Chef can be easily deployed using Docker and Docker Compose for self-hosting.

### Deployment Options

**Option 1: Pre-built Images (Recommended for End Users)**
- No need to build from source
- Faster setup and updates
- Just pull the latest image and run
- See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for instructions

**Option 2: Build from Source (For Developers)**
- Clone the repository and build locally
- Useful for development or custom modifications
- See **[DOCKER.md](./DOCKER.md)** for instructions

### Quick Start (Pre-built Images)

1. **Download deployment files**
   - `docker-compose.prod.yml`
   - `.env.example`

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env and set required variables
   ```

3. **Update image name** in `docker-compose.prod.yml` (replace `yourusername` with actual Docker Hub username)

4. **Start services**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

5. **Access the application**
   Open `http://localhost:3000` in your browser

### Full Documentation

- **End Users**: See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for pre-built image deployment
- **Developers**: See **[DOCKER.md](./DOCKER.md)** for building from source and publishing images

---

## 🗄️ Database Philosophy

* PostgreSQL is the source of truth
* All schema changes live in SQL migrations
* No ORM-only hidden state
* Designed for:

  * Inventory instances
  * Expiration tracking
  * Nutrition data
  * Recipe sharing

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

* Database schema
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
