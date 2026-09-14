#!/usr/bin/env bash
# Optional real-browser smoke test; no model API, credentials, or business data.
set -euo pipefail
root="$(mktemp -d)"
server_pid=''
real_browser="$(command -v agent-browser)"
control_scripts="$(cd "$(dirname "$0")/.." && pwd)"
export AGENT_BROWSER_NAMESPACE="factory-recording-smoke-${GITHUB_RUN_ID:-local}"
export AGENT_BROWSER_SESSION=recording-smoke
export AGENT_BROWSER_EXECUTABLE_PATH="$(command -v google-chrome || command -v chromium)"
export AGENT_BROWSER_ALLOWED_DOMAINS=127.0.0.1
export FACTORY_REAL_AGENT_BROWSER="$real_browser"
export FACTORY_AGENT_BROWSER_COMMAND_LOG="$root/commands.log"
export FACTORY_BROWSER_RECORDING_STATE="$root/recording-active"
browser() { bash "$control_scripts/agent-browser-wrapper.sh" "$@"; }
cleanup() {
  "$real_browser" record stop >/dev/null 2>&1 || true
  "$real_browser" close --all >/dev/null 2>&1 || true
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
  rm -rf "$root"
}
trap cleanup EXIT
cat > "$root/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>Recording smoke test</title>
<style>body{font:24px sans-serif;padding:50px}button{padding:20px}</style>
<h1>Factory recording smoke test</h1><p>Counter: <strong id="count">0</strong></p>
<button id="increment" onclick="document.querySelector('#count').textContent++">Increment</button>
HTML
python3 -m http.server 19108 --bind 127.0.0.1 --directory "$root" >/dev/null 2>&1 &
server_pid=$!
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:19108/ >/dev/null 2>&1; then break; fi
  sleep 1
done
browser open http://127.0.0.1:19108/
browser record start "$root/flow-counter.webm"
browser snapshot -i
browser click '#increment'
browser screenshot "$root/page-counter.png"
# Exercise the wrapper's save-before-close path, not just an explicit stop.
browser close
node --input-type=module - "$root" <<'NODE'
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
for (const [name, magic] of [['flow-counter.webm', '1a45dfa3'], ['page-counter.png', '89504e470d0a1a0a']]) {
  const file = path.join(root, name);
  if (statSync(file).size < 1000 || !readFileSync(file).subarray(0, magic.length / 2).equals(Buffer.from(magic, 'hex'))) {
    throw new Error(`Invalid real-browser evidence: ${name}`);
  }
}
console.log('Real-browser screenshot and WebM recording verified.');
NODE
