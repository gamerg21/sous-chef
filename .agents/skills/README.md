# Convex skills in Sous Chef

All 39 Convex skills listed in [skills-lock.json](../../skills-lock.json) are
installed here, plus `swiftui-pro` for the iOS app in `ios/`. Claude uses relative symlinks in `.claude/skills/` to these same
files. Installation of a skill does not install its external services or MCP tools.

Read [AGENTS.md](../../AGENTS.md) and the following adaptations before following
any skill. These project-specific instructions supersede incompatible generic
procedures, including procedures fetched from a remote catalog. Preserve upstream
`SKILL.md` files; keep local adaptations here so refreshes are reviewable.

## Architecture update: SQLite kitchens

Private kitchen operations now live in `src/server/kitchen/` and use SQLite.
Convex skills apply only to the optional community backend in `convex/`.
Generic instructions to make Convex the only database do not apply to local
kitchens. `pnpm dev` starts only Next.js; there is no Convex kitchen setup job.
Preserve the existing community auth provider/keys. See
[community operations](../../docs/COMMUNITY.md) and
[SQLite migration](../../docs/SQLITE_MIGRATION.md).

## Repository adaptations

| Skill or dependency | Procedure for this repository |
| --- | --- |
| `convex-quickstart`, `quickstart-recipe@^2`, `labs-quickstart` | Sous Chef already exists. Use [first-run setup](../../docs/CONVEX_SETUP.md), retaining community source and existing auth configuration. No recipe runner is installed; do not invoke one or scaffold over this checkout. |
| `convex-ship`, static hosting, publish gateway, `/add-hosting` | Use [DEPLOYMENT.md](../../DEPLOYMENT.md). Build the Next.js standalone server and deploy the web container separately from Convex. Static export and the generic `*.convex.app` upload procedure are incompatible with this app's server routes and runtime configuration. No publishing gateway is configured by these skills. |
| `convex-add`, `/add-component`, `CANDIDATES` | The legacy search script is not installed. Use an available official documentation tool or the selected package's official documentation and installed types; inspect compatibility before adding it. If the catalog is unavailable, use the relevant local skill. Do not invent script paths or claim component installation without verification. |
| Findings bus, `specs/finding.schema.json`, `specs/finding-report.schema.json` | These are external integration references, not files shipped here. Use the local report format below; do not attempt schema-based submission or claim to emit bus events. |
| Official Convex MCP, blocking monitor tools, Sentinel | Discover tool availability first. Use the installed Convex CLI's `--help` for supported read-only alternatives. Report live passes as skipped when the necessary service, credentials, or traffic is unavailable. Installing skills does not configure Sentinel or monitoring. |
| `env` micro power | Read `convex-env/SKILL.md`; use an available Convex env tool or the installed CLI after identifying the target. Never print secret values. Preserve existing signing/encryption keys. |
| `convex-auth`, `convex-setup-auth` | Keep this app's existing Convex Auth email/password flow. Use the project setup guide; generic anonymous-template or passkey setup instructions do not override it. |
| `convex-improve-convex-plugin`, `<anteater>` | No transcript helper is installed. Never execute the placeholder command. Only investigate or configure transcript sharing when the user explicitly requests it; review the actual destination and helper before any authorized upload. |
| `convex-deploy-guard` and automatic push instructions | Resolve the actual cloud or self-hosted target first. Honor existing user authorization for the same action and scope; ask only when required scope or target is missing. Read-only reviews and documentation checks do not require backend pushes. Never infer that an unexpected result proves the wrong deployment changed; check evidence. |
| Generic reviewer absolutes | Judge checks against intended behavior and generated Convex guidance. Deliberately public endpoints need an appropriate access contract; not every public function requires login. Verify actual query/index behavior before reporting performance defects. |

Before changing backend code, read
[the generated guidelines](../../convex/_generated/ai/guidelines.md) first, then
the schema and relevant skill. Prefer the repository's pinned CLI and types over
unverified commands from another plugin runtime.

## Local audit report format

Without a findings service, return a Markdown report containing:

- Scope: code/deployment examined, passes run, and passes skipped with reasons.
- Each finding: severity (`high`, `med`, `low`), class, stable function/table
  identity, code location, concrete evidence, confidence (`confirmed` or
  `plausible`), proposed fix, and relevant skill.
- Deduplicate the same defect by class and identity, retaining all useful evidence.
- When `convex-launch-readiness` requests a score, use its documented formula:
  `max(0, 100 - 15 * high - 5 * med - low)` over confirmed findings only.
  Label a code-only score explicitly. A skipped pass is not a passing result.

This is a local reporting fallback, not an implementation of the external bus.

## Maintaining the installation

Run `pnpm run check:docs` to verify the locked skills exist, skill names match,
Claude links resolve to the canonical directories, and local Markdown references
resolve. The lock records upstream provenance; it is not a runtime health check
or proof that a third-party service is available.

For upstream refreshes, inspect local changes first, then use the Convex-managed
installer (`pnpm exec convex ai-files install`) as directed by its installed help.
Review the resulting skill and lock changes, retain this repository guide, and
rerun `pnpm run check:docs`. Do not refresh merely to repair a missing symlink:
restore the relative link to the existing canonical skill instead.

## Installed inventory

- [convex](convex/SKILL.md)
- [convex-acquire-domain](convex-acquire-domain/SKILL.md)
- [convex-add](convex-add/SKILL.md)
- [convex-advisor](convex-advisor/SKILL.md)
- [convex-agent](convex-agent/SKILL.md)
- [convex-auth](convex-auth/SKILL.md)
- [convex-authz](convex-authz/SKILL.md)
- [convex-backup](convex-backup/SKILL.md)
- [convex-billing](convex-billing/SKILL.md)
- [convex-check-updates](convex-check-updates/SKILL.md)
- [convex-cost](convex-cost/SKILL.md)
- [convex-create-component](convex-create-component/SKILL.md)
- [convex-crons](convex-crons/SKILL.md)
- [convex-deploy-guard](convex-deploy-guard/SKILL.md)
- [convex-design](convex-design/SKILL.md)
- [convex-docs](convex-docs/SKILL.md)
- [convex-domains](convex-domains/SKILL.md)
- [convex-env](convex-env/SKILL.md)
- [convex-expert](convex-expert/SKILL.md)
- [convex-explain-app](convex-explain-app/SKILL.md)
- [convex-improve-convex-plugin](convex-improve-convex-plugin/SKILL.md)
- [convex-insights](convex-insights/SKILL.md)
- [convex-launch-readiness](convex-launch-readiness/SKILL.md)
- [convex-migrate](convex-migrate/SKILL.md)
- [convex-migrate-rehearse](convex-migrate-rehearse/SKILL.md)
- [convex-migration-helper](convex-migration-helper/SKILL.md)
- [convex-monitor](convex-monitor/SKILL.md)
- [convex-optimize](convex-optimize/SKILL.md)
- [convex-performance-audit](convex-performance-audit/SKILL.md)
- [convex-quickstart](convex-quickstart/SKILL.md)
- [convex-reviewer](convex-reviewer/SKILL.md)
- [convex-seed](convex-seed/SKILL.md)
- [convex-self-heal](convex-self-heal/SKILL.md)
- [convex-sentinel](convex-sentinel/SKILL.md)
- [convex-setup-auth](convex-setup-auth/SKILL.md)
- [convex-ship](convex-ship/SKILL.md)
- [convex-suggest](convex-suggest/SKILL.md)
- [convex-test](convex-test/SKILL.md)
- [convex-verify](convex-verify/SKILL.md)
- [swiftui-pro](swiftui-pro/SKILL.md) (iOS app; installed with `npx skills add https://github.com/twostraws/swiftui-agent-skill --skill swiftui-pro`, then moved here and linked from `.claude/skills/`)
