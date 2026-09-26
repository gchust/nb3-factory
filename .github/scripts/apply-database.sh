#!/usr/bin/env bash
# Apply pending migrations and seeds once through the current NocoBase 3 CLI.
# Any failure is final; never retry database writes with a historical command.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$script_dir/timed-command.mjs" db:apply pnpm exec nocobase db apply
