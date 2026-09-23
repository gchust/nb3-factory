#!/usr/bin/env bash
# The implementation and repair agents start the application themselves to check their work.
# A dev server left in the background keeps the application port, and the dev server restarts
# its own listener when that dies, so stopping the socket alone is not enough: the application
# processes have to stop. Verification owns the port and starts from a clean slate.
#
# Only processes running this application are stopped. A port held by anything else is
# reported and left alone, because killing whatever happens to hold a port is not this
# script's call to make.
set -uo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: stop-stale-app.sh <port>" >&2
  exit 2
fi
port="$1"
caller_pid="$PPID"

# A command line matching one of these is running the application under test.
APP_PROCESS_PATTERNS=(
  'scripts/dev/index.mjs'
  'scripts/dev.mjs'
  'server/standalone.ts'
  'scripts/start.mjs'
  'dist/server/standalone.js'
)

app_process_pids() {
  local pattern
  for pattern in "${APP_PROCESS_PATTERNS[@]}"; do
    pgrep -f -- "$pattern" 2>/dev/null || true
  done
}

port_listener_pids() {
  if command -v ss >/dev/null 2>&1; then
    ss --listening --tcp --numeric --processes "sport = :$port" 2>/dev/null |
      grep -oE 'pid=[0-9]+' | cut -d= -f2 || true
  else
    lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  fi
}

# This script and whoever started it are never candidates, whatever they are named.
own_pids() {
  grep -vx -e "$$" -e "$caller_pid" || true
}

stale_app_pids() {
  app_process_pids | grep -E '^[0-9]+$' | sort -u | own_pids
}

pids="$(stale_app_pids)"
if [[ -n "$pids" ]]; then
  echo "Stopping application processes left behind before verification:" >&2
  ps -o pid=,args= -p $pids >&2 2>/dev/null || true
  kill $pids 2>/dev/null || true
  for _ in $(seq 1 20); do
    [[ -z "$(stale_app_pids)" ]] && break
    sleep 0.5
  done
  remaining="$(stale_app_pids)"
  if [[ -n "$remaining" ]]; then
    echo "Application processes ignored the stop signal; forcing them to end." >&2
    kill -9 $remaining 2>/dev/null || true
    sleep 1
  fi
fi

listeners="$(port_listener_pids | grep -E '^[0-9]+$' | sort -u | own_pids)"
if [[ -z "$listeners" ]]; then
  exit 0
fi

echo "Port ${port} is held by a process that is not this application:" >&2
ps -o pid=,args= -p $listeners >&2 2>/dev/null || true
echo "Verification cannot start the application until that port is free." >&2
exit 1
