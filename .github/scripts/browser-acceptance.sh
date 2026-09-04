#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 7 ]]; then
  echo "Usage: browser-acceptance.sh <control-dir> <workspace> <metadata> <config-file> <artifact-dir> <state-dir> <attempt>" >&2
  exit 2
fi

control_dir="$(realpath "$1")"
workspace="$(realpath "$2")"
metadata="$(realpath "$3")"
config_file="$(realpath "$4")"
artifact_dir="$(realpath -m "$5")"
state_dir="$(realpath -m "$6")"
attempt="$7"
mkdir -p "$artifact_dir" "$state_dir"

real_agent_browser="$(command -v agent-browser || true)"
if [[ -z "$real_agent_browser" ]]; then
  echo "agent-browser is not installed." >&2
  exit 2
fi

chrome_path="${AGENT_BROWSER_EXECUTABLE_PATH:-$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || true)}"
if [[ -z "$chrome_path" ]]; then
  echo "No Chrome or Chromium executable is available for agent-browser." >&2
  exit 2
fi

port="${FACTORY_APP_PORT:-13000}"
base_path="${FACTORY_APP_BASE_PATH:-/main}"
base_path="/${base_path#/}"
base_path="${base_path%/}"
origin="http://127.0.0.1:${port}"
url="${origin}${base_path}/"
server_log="$artifact_dir/application.log"
report="$artifact_dir/report.json"
evidence_dir="$artifact_dir/evidence"
commands_log="$artifact_dir/agent-browser-commands.log"
browser_prompt="$state_dir/browser-acceptance.md"
browser_agent_workspace="$state_dir/browser-agent-workspace"
browser_agent_dir="$state_dir/pi-browser-agent"
wrapper_dir="$state_dir/browser-bin"
mkdir -p "$evidence_dir" "$browser_agent_workspace" "$wrapper_dir"
: >"$commands_log"
ln -sf "$control_dir/.github/scripts/agent-browser-wrapper.sh" "$wrapper_dir/agent-browser"

node "$control_dir/.github/scripts/build-browser-prompt.mjs" \
  --metadata "$metadata" \
  --template "$control_dir/.github/prompts/browser-acceptance.md" \
  --output "$browser_prompt"

export APP_CONFIG_FILE="$config_file"

cd "$workspace"
APP_SERVER_HOST=127.0.0.1 \
APP_SERVER_PORT="$port" \
APP_PUBLIC_ORIGIN="$origin" \
NODE_ENV=production \
pnpm start >"$server_log" 2>&1 &
server_pid=$!

cleanup() {
  AGENT_BROWSER_NAMESPACE="nb3-factory-${GITHUB_RUN_ID:-local}-${attempt}" \
    "$real_agent_browser" close --all >/dev/null 2>&1 || true
  if kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 90); do
  if curl --silent --show-error --fail "$url" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "Application exited before Agent Browser acceptance." >&2
    tail -n 200 "$server_log" >&2 || true
    exit 2
  fi
  sleep 1
done

if [[ "$ready" != "1" ]]; then
  echo "Application did not become ready at $url." >&2
  tail -n 200 "$server_log" >&2 || true
  exit 2
fi

credential_suffix="${GITHUB_RUN_ID:-local}-${attempt}-${RANDOM}"
export FACTORY_BROWSER_URL="$url"
export FACTORY_ADMIN_USERNAME="nocobase"
export FACTORY_ADMIN_PASSWORD="admin123"
export FACTORY_TEST_NAME="Factory QA"
export FACTORY_TEST_USERNAME="factoryqa${credential_suffix//-/}"
export FACTORY_TEST_EMAIL="factory-${credential_suffix}@example.invalid"
export FACTORY_TEST_PASSWORD="Factory-QA-${credential_suffix}-A9!"
export FACTORY_BROWSER_REPORT="$report"
export FACTORY_BROWSER_EVIDENCE_DIR="$evidence_dir"
export FACTORY_REAL_AGENT_BROWSER="$real_agent_browser"
export FACTORY_AGENT_BROWSER_COMMAND_LOG="$commands_log"
export AGENT_BROWSER_EXECUTABLE_PATH="$chrome_path"
export AGENT_BROWSER_ALLOWED_DOMAINS="127.0.0.1"
export AGENT_BROWSER_CONTENT_BOUNDARIES=1
export AGENT_BROWSER_MAX_OUTPUT=50000
export AGENT_BROWSER_NAMESPACE="nb3-factory-${GITHUB_RUN_ID:-local}-${attempt}"
export AGENT_BROWSER_SESSION="qa-${attempt}"
export AGENT_BROWSER_NO_WEBMCP=1
export PATH="$wrapper_dir:$PATH"

node "$control_dir/.github/scripts/run-pi.mjs" \
  --workspace "$browser_agent_workspace" \
  --prompt "$browser_prompt" \
  --log "$artifact_dir/pi-browser-acceptance.jsonl" \
  --agentDir "$browser_agent_dir"

set +e
node "$control_dir/.github/scripts/validate-browser-report.mjs" \
  --metadata "$metadata" \
  --report "$report" \
  --commands "$commands_log" \
  --evidence "$evidence_dir"
validation_status=$?
set -e

if [[ "$validation_status" -eq 10 ]]; then
  exit 10
fi
if [[ "$validation_status" -ne 0 ]]; then
  exit 2
fi
