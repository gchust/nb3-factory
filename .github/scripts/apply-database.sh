#!/usr/bin/env bash
# Applies pending migrations, then seeds, through the application's own commands
# in the current directory. Newer templates publish both as one `db:apply` plan
# and no longer have `migrate` and `seed`; earlier baselines only have the pair.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
timed() { node "$script_dir/timed-command.mjs" "$1" pnpm "$1"; }

if node -e '
  const fs = require("node:fs");
  const scripts = fs.existsSync("package.json") ? JSON.parse(fs.readFileSync("package.json", "utf8")).scripts : {};
  process.exit(scripts?.["db:apply"] ? 0 : 1);
'; then
  timed db:apply
else
  timed migrate
  timed seed
fi
