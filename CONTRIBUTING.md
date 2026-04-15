# Contributing to Sous Chef

Thank you for your interest in contributing to Sous Chef! We're excited to have you as part of our community. This document provides guidelines and instructions for contributing to the project.

## Welcome

Sous Chef is an open-source kitchen management application built with Next.js and TypeScript. Whether you're fixing bugs, adding features, or improving documentation, your contributions are valuable and appreciated.

## Getting Started

### Prerequisites

- Node.js 20 LTS or later
- pnpm 10.x (`npm install -g pnpm`)
- Convex account/deployment access
- Git

### Setting Up Your Development Environment

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/sous-chef.git
   cd sous-chef
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure environment variables:**
   - Copy the example env file:
     ```bash
     cp .env.example .env
     ```
   - Fill in the required environment variables (`NEXT_PUBLIC_CONVEX_URL`, etc.).

4. **Start Convex backend dev loop:**
   ```bash
   npx convex dev
   ```

5. **Start the development server:**
   ```bash
   pnpm dev
   ```

   The app should now be running at `http://localhost:3000`

6. **(Optional) Seed demo data:**
   ```bash
   pnpm seed:demo
   ```
   This creates a demo user (`demo@souschef.app` / `demo1234`) with sample recipes, inventory, and shopping list items.

## Development Workflow

### Running Tests

Execute the test suite with:
```bash
pnpm test
```

### Type Checking

Ensure TypeScript compilation is error-free:
```bash
pnpm type-check
```

### Linting and Formatting

Run the linter to check for code quality issues:
```bash
pnpm lint
```

## Coding Standards

- **TypeScript Strict Mode:** All code must pass TypeScript strict mode compilation
- **Follow Existing Patterns:** Review existing code to understand and maintain consistent patterns
- **React Query:** Use React Query for all data fetching operations
- **Component Structure:** Keep components focused and modular
- **Type Safety:** Avoid using `any` types; use proper TypeScript types
- **Comments:** Add comments for complex logic, but keep them concise
- **Testing:** Write tests for new features and bug fixes

## Submitting Changes

### Creating a Branch

Create a descriptive branch for your changes:
```bash
git checkout -b feature/add-user-preferences
# or
git checkout -b fix/meal-calculation-bug
```

### Making Commits

Write clear, descriptive commit messages:
```bash
git commit -m "feat: add meal preference storage

- Implement user preference model
- Add API endpoints for managing preferences
- Include preference selection in meal planning"
```

### Before Submitting a Pull Request

Ensure your changes pass all checks:
```bash
pnpm test
pnpm type-check
pnpm lint
```

### Opening a Pull Request

1. Push your branch to your fork
2. Open a pull request against the `main` branch of the main repository
3. Fill out the PR template completely
4. Link any related issues
5. Request review from maintainers

**PR Guidelines:**
- Keep PRs focused on a single feature or bug fix
- Include tests for new functionality
- Update documentation if needed
- Respond to review feedback promptly

## Reporting Issues

### Bug Reports

When reporting a bug, please include:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Screenshots or error logs if applicable
- Your environment (OS, browser, Node.js version, etc.)

### Feature Requests

For feature requests, include:
- A clear description of the feature
- Use cases and motivations
- Potential implementation approach (if you have ideas)

## Code of Conduct

This project adheres to the Contributor Covenant Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## License and Legal

Sous Chef is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. By contributing to this project, you agree that:

- Your contributions will be licensed under the AGPL-3.0 license
- If you distribute software that uses this code, you must make the source code available
- This applies to software running on servers and accessible over a network

For more information, see the [LICENSE](LICENSE) file.

## Questions?

If you have questions or need help:
- Check the existing issues and discussions
- Ask in GitHub Discussions
- Contact the maintainers

Thank you for helping make Sous Chef better!
