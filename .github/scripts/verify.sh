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

export FACTORY_TIMINGS_FILE="${FACTORY_TIMINGS_FILE:-$artifact_dir/timings.jsonl}"
timed() { node "$script_dir/timed-command.mjs" "$1" pnpm "$1"; }
# Only repair-loop workspaces are normalized; independent final verification
# checks accepted bytes without editing them. Refresh candidates have no Git yet.
if [[ "${FACTORY_RETRY_FAILED_CHECK:-0}" == '1' ]]; then
  node "$script_dir/timed-command.mjs" format:auto node "$script_dir/format-changes.mjs" "$workspace"
fi
failed_stage="$artifact_dir/../last-failed-stage"
run_check() {
  if timed "$1"; then return 0; else
    local status=$?
    printf '%s\n' "$1" >"$failed_stage"
    return "$status"
  fi
}
# First retry the previously failing check, then still run every required check.
previous=''
if [[ "${FACTORY_RETRY_FAILED_CHECK:-0}" == '1' && -f "$failed_stage" ]]; then
  previous="$(cat "$failed_stage")"
  case "$previous" in
    format:check|lint|typecheck|test) run_check "$previous" ;;
    *) previous='' ;;
  esac
fi
for check in format:check lint typecheck test; do
  [[ "$check" == "$previous" ]] || run_check "$check"
done
rm -f "$failed_stage"
if [[ -n "${FACTORY_BUILD_TARGET:-}" ]]; then
  NODE_ENV=production node "$script_dir/timed-command.mjs" build pnpm build --target "$FACTORY_BUILD_TARGET" --node-version "${FACTORY_BUILD_NODE_VERSION:-24}"
else
  NODE_ENV=production timed build
fi
timed migrate
timed seed

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

"$script_dir/stop-stale-app.sh" "$port"

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
status=''
for _ in $(seq 1 90); do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' "$url" 2>/dev/null || true)"
  if [[ "$status" =~ ^[23] ]]; then
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
  echo "Application did not become ready at $url (last HTTP status: ${status:-none})." >&2
  tail -n 200 "$server_log" >&2 || true
  exit 1
fi

node "$script_dir/timed-command.mjs" browser-smoke node "$script_dir/browser-smoke.mjs" \
  --workspace "$workspace" \
  --url "$url" \
  --screenshot "$artifact_dir/browser-smoke.png"
