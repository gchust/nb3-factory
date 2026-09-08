#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${SOURCE_RUN_ID:?SOURCE_RUN_ID is required}"
: "${SOURCE_ATTEMPT:?SOURCE_ATTEMPT is required}"
: "${FACTORY_REPORT_REF:?FACTORY_REPORT_REF is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
if [[ ! "$SOURCE_RUN_ID" =~ ^[1-9][0-9]*$ || ! "$SOURCE_ATTEMPT" =~ ^[1-9][0-9]*$ ]]; then
  echo "Source run and attempt must be positive integers." >&2
  exit 2
fi

# GITHUB_TOKEN can explicitly dispatch workflows even when a bot-triggered
# continuation does not produce the downstream workflow_run event.
dispatch() {
  local workflow="$1"
  for attempt in 1 2 3; do
    if timeout --kill-after=5s 30s gh workflow run "$workflow" \
      --repo "$GITHUB_REPOSITORY" --ref "$FACTORY_REPORT_REF" \
      --field "run_id=$SOURCE_RUN_ID" --field "attempt=$SOURCE_ATTEMPT"; then
      echo "Requested $workflow for run $SOURCE_RUN_ID, attempt $SOURCE_ATTEMPT."
      return 0
    fi
    if [[ "$attempt" -lt 3 ]]; then sleep 2; fi
  done
  echo "::warning::Could not dispatch $workflow; replay it with run_id=$SOURCE_RUN_ID and attempt=$SOURCE_ATTEMPT."
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '\nReport dispatch failed: `%s`. Replay with `run_id=%s`, `attempt=%s`; do not rebuild the application.\n' \
      "$workflow" "$SOURCE_RUN_ID" "$SOURCE_ATTEMPT" >> "$GITHUB_STEP_SUMMARY"
  fi
  return 1
}

failed=0
dispatch report-task-usage.yml || failed=1
# A handoff/failure is reportable usage, but never a completed business delivery.
if [[ "${FACTORY_TASK_DELIVERED:-false}" == 'true' ]]; then
  dispatch publish-visual-report.yml || failed=1
fi
exit "$failed"
