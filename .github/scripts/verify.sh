#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: verify.sh <workspace> <config-file> <artifact-dir>" >&2
  exit 2
fi

# Only the independent checker receives isolated API credentials. Application
# tests, builds and the server must not inherit them through this shell.
required_checks_api_key="${FACTORY_TEST_API_KEY:-}"
required_checks_admin_key="${FACTORY_TEST_ADMIN_KEY:-}"
export -n required_checks_api_key required_checks_admin_key
unset FACTORY_TEST_API_KEY FACTORY_TEST_ADMIN_KEY

workspace="$(realpath "$1")"
config_file="$(realpath "$2")"
artifact_dir="$(realpath -m "$3")"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$artifact_dir"

export APP_CONFIG_FILE="$config_file"
export NODE_ENV=test

cd "$workspace"

export FACTORY_TIMINGS_FILE="${FACTORY_TIMINGS_FILE:-$artifact_dir/timings.jsonl}"
timed() {
  case "$1" in
    lint)
      node "$script_dir/timed-command.mjs" lint pnpm lint --ignore-pattern '.github/**'
      ;;
    format:check)
      # A negative CLI glob keeps the app's own ignore/config files unchanged.
      node "$script_dir/timed-command.mjs" format:check pnpm format:check '!.github/**'
      ;;
    lockfile)
      # The lockfile must still match every manifest: final verification and
      # deployment install with --frozen-lockfile, and a drift found only there
      # fails a task the repair loop could have fixed in one round. Checked
      # lockfile-only, without scripts: about a second, node_modules untouched.
      node "$script_dir/timed-command.mjs" lockfile \
        pnpm install --frozen-lockfile --lockfile-only --prefer-offline --ignore-scripts
      ;;
    *) node "$script_dir/timed-command.mjs" "$1" pnpm "$1" ;;
  esac
}
failed_stage="$artifact_dir/../last-failed-stage"
run_check() {
  if timed "$1"; then return 0; else
    local status=$?
    # Final verification only (FACTORY_RETRY_TEST_ONCE): the application test
    # suite is run once more after a failure, because a template test flake
    # would otherwise fail a build whose repair loop already passed. Only the
    # `test` check, at most once, and the retry is logged and recorded.
    if [[ "$1" == test && "${FACTORY_RETRY_TEST_ONCE:-0}" == '1' ]]; then
      echo "::warning::The test check failed (exit $status) in final verification; running it once more."
      printf 'test exit %s\n' "$status" >"$artifact_dir/test-retried"
      if timed test; then return 0; else status=$?; fi
    fi
    printf '%s\n' "$1" >"$failed_stage"
    return "$status"
  fi
}
# First retry the previously failing check, then still run every required check.
previous=''
if [[ "${FACTORY_RETRY_FAILED_CHECK:-0}" == '1' && -f "$failed_stage" ]]; then
  previous="$(cat "$failed_stage")"
fi
# Only repair-loop workspaces are normalized; independent final verification
# checks accepted bytes without editing them. Refresh candidates have no Git yet.
# Its own stage is written first: a failure here exits through set -e, and the
# file would otherwise still name the check the previous round failed.
if [[ "${FACTORY_RETRY_FAILED_CHECK:-0}" == '1' ]]; then
  printf '%s\n' format >"$failed_stage"
  node "$script_dir/timed-command.mjs" format:auto node "$script_dir/format-changes.mjs" "$workspace"
fi
case "$previous" in
  lockfile|format:check|lint|typecheck|test) run_check "$previous" ;;
  *) previous='' ;;
esac
for check in lockfile format:check lint typecheck test; do
  [[ "$check" == "$previous" ]] || run_check "$check"
done
# The build and the database step fail this script through set -e, so their
# stage is written before they run and cleared once both passed. Without it a
# build error kept whatever stage an earlier round failed in, its fingerprint
# changed every round, and the three-identical-failures stop never saw it.
printf '%s\n' build >"$failed_stage"
build_args=()
if [[ -n "${FACTORY_BUILD_TARGET:-}" ]]; then
  build_args+=(--target "$FACTORY_BUILD_TARGET" --node-version "${FACTORY_BUILD_NODE_VERSION:-24}")
fi
# The template's own `--tar` archives the dist this one build produced, so the
# deployable is the verified bytes. Current CLI templates do not ship a
# standalone pack script the factory could run after the build instead.
if [[ "${FACTORY_BUILD_ARCHIVE:-0}" == '1' ]]; then
  build_args+=(--tar)
fi
NODE_ENV=production node "$script_dir/timed-command.mjs" build pnpm build ${build_args[@]+"${build_args[@]}"}
printf '%s\n' database >"$failed_stage"
"$script_dir/apply-database.sh"
# Later failures are browser failures, which the repair loop records by kind.
rm -f "$failed_stage"

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

# Independent deterministic checks run against this same fresh final application.
# No caller-supplied command/module/URL is executed; the trusted registry owns it.
if [[ -n "${FACTORY_REQUIRED_CHECKS_METADATA:-}" ]]; then
  FACTORY_TEST_API_KEY="$required_checks_api_key" \
  FACTORY_TEST_ADMIN_KEY="$required_checks_admin_key" \
  node "$script_dir/required-checks.mjs" run "$FACTORY_REQUIRED_CHECKS_METADATA" \
    "$artifact_dir/../required-checks.json" "$FACTORY_REQUIRED_CHECKS_PATCH"
fi
