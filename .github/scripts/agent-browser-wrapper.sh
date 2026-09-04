#!/usr/bin/env bash
set -euo pipefail

: "${FACTORY_REAL_AGENT_BROWSER:?FACTORY_REAL_AGENT_BROWSER is required}"
: "${FACTORY_AGENT_BROWSER_COMMAND_LOG:?FACTORY_AGENT_BROWSER_COMMAND_LOG is required}"

command_name=""
for argument in "$@"; do
  case "$argument" in
    open|goto|navigate|snapshot|click|dblclick|fill|type|press|select|check|uncheck|eval|screenshot|console|errors|close|skills|batch)
      command_name="$argument"
      break
      ;;
  esac
done

if [[ -n "$command_name" ]]; then
  printf '%s\n' "$command_name" >>"$FACTORY_AGENT_BROWSER_COMMAND_LOG"
fi

exec "$FACTORY_REAL_AGENT_BROWSER" "$@"
