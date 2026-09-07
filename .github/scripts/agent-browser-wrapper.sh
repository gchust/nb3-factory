#!/usr/bin/env bash
set -euo pipefail

: "${FACTORY_REAL_AGENT_BROWSER:?FACTORY_REAL_AGENT_BROWSER is required}"
: "${FACTORY_AGENT_BROWSER_COMMAND_LOG:?FACTORY_AGENT_BROWSER_COMMAND_LOG is required}"

command_name=""
for argument in "$@"; do
  case "$argument" in
    open|goto|navigate|snapshot|click|dblclick|fill|type|press|select|check|uncheck|eval|screenshot|console|errors|close|skills|batch|record)
      command_name="$argument"
      break
      ;;
  esac
done

if [[ -n "$command_name" ]]; then
  printf '%s\n' "$command_name" >>"$FACTORY_AGENT_BROWSER_COMMAND_LOG"
fi

if [[ "$command_name" == 'close' && -f "${FACTORY_BROWSER_RECORDING_STATE:-/nonexistent}" ]]; then
  timeout --kill-after=5s 30s "$FACTORY_REAL_AGENT_BROWSER" record stop || true
fi

if [[ "$command_name" == 'record' ]]; then
  action=""
  previous=""
  for argument in "$@"; do
    if [[ "$previous" == 'record' ]]; then action="$argument"; break; fi
    previous="$argument"
  done
  if [[ "$action" == 'start' || "$action" == 'restart' ]]; then
    if [[ -n "${FACTORY_BROWSER_RECORDING_STATE:-}" ]]; then
      touch "$FACTORY_BROWSER_RECORDING_STATE"
    fi
  fi
  # Recording is supplementary. A codec error/hung recorder must not stop QA.
  if timeout --kill-after=5s 30s "$FACTORY_REAL_AGENT_BROWSER" "$@"; then
    if [[ "$action" == 'stop' && -n "${FACTORY_BROWSER_RECORDING_STATE:-}" ]]; then
      rm -f "$FACTORY_BROWSER_RECORDING_STATE"
    fi
  else
    echo 'Warning: optional browser recording failed; continue the required screenshot-based acceptance.' >&2
  fi
  exit 0
fi

exec "$FACTORY_REAL_AGENT_BROWSER" "$@"
