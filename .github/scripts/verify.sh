#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: verify.sh <workspace> <config-file> <artifact-dir>" >&2
  exit 2
fi

workspace="$(realpath "$1")"
config_file="$(realpath "$2")"
artifact_dir="$(realpath -m "$3")"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$artifact_dir"

export APP_CONFIG_FILE="$config_file"
export NODE_ENV=test

cd "$workspace"

pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build
node --import tsx ./scripts/migrate.ts
node --import tsx ./scripts/seed.ts

if [[ "${FACTORY_SKIP_BROWSER:-0}" == "1" ]]; then
  echo "Browser smoke skipped by FACTORY_SKIP_BROWSER=1."
  exit 0
fi

port="${FACTORY_APP_PORT:-13000}"
base_path="${FACTORY_APP_BASE_PATH:-/main}"
base_path="/${base_path#/}"
base_path="${base_path%/}"
origin="http://127.0.0.1:${port}"
server_log="$artifact_dir/application.log"

APP_SERVER_HOST=127.0.0.1 \
APP_SERVER_PORT="$port" \
APP_PUBLIC_ORIGIN="$origin" \
NODE_ENV=production \
pnpm start >"$server_log" 2>&1 &
server_pid=$!

cleanup() {
  if kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

url="${origin}${base_path}/"
ready=0
for _ in $(seq 1 90); do
  if curl --silent --show-error --fail "$url" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "Application exited before becoming ready." >&2
    tail -n 200 "$server_log" >&2 || true
    exit 1
  fi
  sleep 1
done

if [[ "$ready" != "1" ]]; then
  echo "Application did not become ready at $url." >&2
  tail -n 200 "$server_log" >&2 || true
  exit 1
fi

node "$script_dir/browser-smoke.mjs" \
  --workspace "$workspace" \
  --url "$url" \
  --screenshot "$artifact_dir/browser-smoke.png"
