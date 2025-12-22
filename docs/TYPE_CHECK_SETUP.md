# Type Check Setup

This project now has comprehensive type checking in place to catch TypeScript errors before they reach production builds.

## Available Commands

### `npm run type-check`
Runs TypeScript type checking without building. This is fast and catches all type errors.

### `npm run type-check:watch`
Runs type checking in watch mode, automatically re-checking when files change.

### `npm run build`
Automatically runs `type-check` before building (via `prebuild` script).

## Pre-commit Hook

A Git pre-commit hook is set up using Husky that automatically runs type checking before each commit. If type errors are found, the commit will be blocked.

To bypass the hook (not recommended):
```bash
git commit --no-verify
```

## CI/CD Integration

A GitHub Actions workflow (`.github/workflows/type-check.yml`) automatically runs type checking on:
- Push to main/master/develop branches
- Pull requests to main/master/develop branches

This ensures type errors are caught before code is merged.

## Docker Build

The Dockerfile now runs `type-check` before building, so Docker builds will fail fast if there are type errors, saving build time.

## Fixing Type Errors

When you see type errors:

1. **Local Development**: Run `npm run type-check` to see all errors at once
2. **Before Committing**: The pre-commit hook will catch errors automatically
3. **In CI/CD**: GitHub Actions will report errors in the PR checks
4. **In Docker**: Build will fail early with a clear error message

## Current Status

There are currently some existing type errors in the codebase. These should be fixed gradually, but new errors will now be caught immediately by the type checking infrastructure.

