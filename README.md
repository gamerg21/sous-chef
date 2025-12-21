# Sous Chef 🍳

Sous Chef is an **open-source, self-hostable personal kitchen assistant**.
It helps individuals and households keep their **pantry, refrigerator/freezer, recipes, and shopping** organized — all while remaining **community-first** and **privacy-respecting**.

Sous Chef is designed to work equally well:

* **Self-hosted** (local server, NAS, homelab, offline-friendly)
* **Hosted** (future managed service with optional premium features)

The long-term goal is to make Sous Chef the *“do-it-all” digital sous chef* for any kitchen, without locking users into a closed ecosystem.

---

## ✨ Core Principles

* **Community-first & Open Source**
* **Self-host agnostic** (runs locally or in the cloud)
* **Feature parity** between self-hosted and hosted versions
* **Offline-tolerant** mobile experience
* **Household-based** (multiple users, shared kitchen)
* **Extensible** (AI, integrations, scanners, future hardware)

---

## 🧠 What Sous Chef Does

### Inventory Management

* Pantry / fridge / freezer tracking
* **Unit-level quantities** (e.g., 2 eggs, 500g rice)
* **Expiration dates per item instance**
* Photo attachments
* Barcode scanning (UPC/EAN)
* Manual label scanning for non-barcode foods

### Recipes

* Private by default, **shareable with the community**
* Ingredient-to-inventory mapping
* Nutrition macros per serving
* Photos and notes
* Recipe import/export (JSON)

### Cooking & Planning

* “Cook recipe” flow automatically deducts inventory
* Missing ingredients go to shopping list
* Shopping list supports barcode scanning + manual adds

### Community Recipes

* Recipes can be published to a **public community catalog**
* Self-hosted users retain full functionality via:

  * Local sharing
  * Import/export
  * Optional connection to hosted community

### AI (Optional)

* Meal planning, substitutions, nutrition insights
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
  * Realtime
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
* Magic link support (via email provider)
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
# Get the database URL from: pnpm supabase status
# It will look like: postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# NextAuth secret (generate a random string)
# You can generate one with: openssl rand -base64 32
NEXTAUTH_SECRET="your-secret-key-here"

# NextAuth URL (for local development)
NEXTAUTH_URL="http://localhost:3000"
```

### 4. Run database migrations

```bash
# Run Prisma migrations to set up the database schema
# This will also generate the Prisma client automatically
pnpm prisma migrate dev

# If you need to generate the Prisma client separately (e.g., after schema changes)
pnpm prisma generate
```

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
