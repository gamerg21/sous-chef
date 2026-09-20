# Type checks and tests

Use Node.js 22.18+ and the exact pnpm version in package.json.

- `pnpm type-check`: application, local server, and test TypeScript.
- `pnpm test`: unit tests, real SQLite integration tests, and Convex community tests.
- `pnpm lint`: application/style checks.
- `pnpm build`: Next.js standalone production output.
- `pnpm check:docs`: links and installed skill integrity.

Convex community deployments additionally run their own TypeScript check.
The local model/runtime files under `src/server/kitchen/_generated/` are
hand-maintained compatibility types for the ported domain code; do not run Convex
codegen there. The actual generated community bindings live in `convex/_generated/`.

Tests do not prove deployment or browser acceptance. See the architecture and
operation boundaries in [AGENTS.md](../AGENTS.md).
