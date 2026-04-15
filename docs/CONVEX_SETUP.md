# Convex Setup Guidelines

This document is the recommended setup path for Sous Chef backend configuration.

## Why Convex

Sous Chef now recommends Convex for backend APIs, data access, and realtime sync.

## Prerequisites

- Node.js 20+
- Package manager installed (`npm`, `pnpm`, or `yarn`)
- Convex account (or anonymous/dev mode where applicable)

## 1) Install Dependencies

From the project root:

```bash
npm install
```

## 2) Start Convex Development

Run:

```bash
npx convex dev
```

On first run, Convex will guide authentication and create/update generated files under `convex/_generated`.

Keep `npx convex dev` running while developing.

## 3) Confirm Environment Variable

Ensure your app environment includes:

```env
NEXT_PUBLIC_CONVEX_URL=...
```

`npx convex dev` usually writes this into your local env file automatically.

## 4) Start the App

In a second terminal:

```bash
npm run dev
```

## 5) Self-Hosting Notes

If you self-host the app with Docker:

- Build/run the app container as usual.
- Provide `NEXT_PUBLIC_CONVEX_URL` in container environment.
- Keep using Convex as the backend service.

## Verification Checklist

- `npx convex dev` runs without errors.
- `convex/_generated/api.ts` and related generated files exist.
- App can load data without backend connection errors.
