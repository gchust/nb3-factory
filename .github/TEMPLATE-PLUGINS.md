# Refresh template: plugin baseline

`Refresh NocoBase Template` still creates a fresh `@nocobase/app-template-default@latest` application. It then installs and registers an explicit baseline before the existing application verification and publication steps:

| Package | Role |
| --- | --- |
| `@nocobase/app-plugin-ai-employee` | AI Employee; already in the current default template and required by Knowledge Base |
| `@nocobase/app-plugin-ai-knowledge-base` | Pro knowledge-base plugin |
| `@nocobase/app-plugin-mail` | Pro user-mailbox plugin; not `@nocobase/plugin-email-manager` |

The list is maintained in `.github/scripts/template-plugins.mjs`. This is not an automatic discovery mechanism for all future commercial packages, and it does not use the retired Pro template or copy commercial source into this repository.

## Refresh sequence

1. Generate the latest official default template and restore factory controls.
2. Install application dependencies, then add the listed packages at `latest` in one package-manager operation. The generated lockfile retains the resolved versions.
3. Run the official `plugin:register` command for every package with `--no-install --no-skills`. This wires exported Client/Server/CLI entries without repeating dependency installation. Existing registration is accepted as a no-op. Then wire the public `mailConfig` factory through `server/config/mail.ts` and the typed `defaultAppConfigs` composition in `server/config/index.ts`. Do not rely on a plugin release providing fallback defaults.
4. Run `pnpm skills:sync`, then inspect every package with `plugin:inspect --json`. Require production dependencies, Client/Server registration, any exported CLI registration, and matching package-owned Skills. A zero exit code alone is not sufficient; partial registration and inconsistent inspection stop the refresh.
5. Record installed versions in `factory-template.json.plugins`, CLI responses in `template-diagnostics/template-plugins/`, and an inventory in the Actions summary. The inventory establishes static installation/registration only, not application or external-provider readiness.
6. Continue the existing factory tests, application checks/build, isolated database initialization, and browser login verification. Only a verified baseline is eligible for publication.

The existing scoped registry in `.npmrc` also reaches nested pnpm roots. Registry authentication, missing packages, incompatible releases, or failed plugin checks fail the workflow; no plugin is silently skipped and no registry/license restriction is bypassed.

## Runtime configuration

Installation is not external-service configuration. Do not commit mailbox passwords, OAuth secrets, model API keys, or vector-database credentials. Mail providers and Knowledge Base model/vector services must be configured for the consuming application. The refreshed App explicitly composes the installed Mail package's default configuration factory. Its defaults do not configure external accounts; provider/configuration details belong to its synchronized Skill. Existing application runtime verification remains required even after static inspection passes.

The generated `AGENTS.md` is not modified, and old `.agents` content is not copied. Skills come from the newly installed packages. Existing application branches are not upgraded by this change.

After merging this change into `develop`, start a **new** Refresh workflow from `develop`. `dry_run=true` runs generation and verification without publishing; `dry_run=false` retains the existing backup and guarded publish behavior. Re-running an old workflow run does not select this new workflow implementation.

## Pull-request verification

Owner-triggered, same-repository PRs targeting `develop` and changing the refresh workflow, template integration scripts, overlay, or verification script run the **same** generation, plugin installation, application tests, build, isolated database, and browser checks before merging. They check out the PR merge commit, have only `contents: read`, and share the existing refresh queue. Publication is restricted to `workflow_dispatch` with `dry_run=false`. No PR verification updates `develop`, and fixture-only Factory regression results do not stand in for this integration run.
