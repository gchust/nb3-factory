#!/usr/bin/env bash
# Applies pending migrations, then seeds, through the application's own commands
# in the current directory. Support the package CLI, the db:apply script alias,
# and the earlier separate migrate/seed scripts without retrying failed writes.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
timed() { local stage="$1"; shift; node "$script_dir/timed-command.mjs" "$stage" pnpm "$@"; }

mode="$(node --input-type=module - "$script_dir/template-cli.mjs" <<'NODE'
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { hasPackageCli } = await import(pathToFileURL(process.argv[2]).href);
const app = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')) : {};
console.log(app.scripts?.['db:apply'] ? 'script' : hasPackageCli(app) ? 'cli' : 'legacy');
NODE
)"
case "$mode" in
  script) timed db:apply db:apply ;;
  cli) timed db:apply exec nocobase db apply ;;
  legacy) timed migrate migrate; timed seed seed ;;
  *) echo "Unsupported database command mode: $mode" >&2; exit 1 ;;
esac
