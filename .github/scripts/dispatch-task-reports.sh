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
# A request normally returns in a second or two. Worst case per report: three
# 15 s attempts (plus 5 s to kill each) and the 2 s and 8 s backoffs, 70 s; six
# reports take 420 s, inside the 10-minute dispatch-reports job in
# code-agent-task.yml. task-report-dispatch.test.mjs checks that budget.
DISPATCH_ATTEMPT_TIMEOUT=15s
DISPATCH_KILL_AFTER=5s
DISPATCH_BACKOFF=(2 8)
dispatch() {
  local workflow="$1"
  for attempt in 1 2 3; do
    if timeout --kill-after="$DISPATCH_KILL_AFTER" "$DISPATCH_ATTEMPT_TIMEOUT" gh workflow run "$workflow" \
      --repo "$GITHUB_REPOSITORY" --ref "$FACTORY_REPORT_REF" \
      --field "run_id=$SOURCE_RUN_ID" --field "attempt=$SOURCE_ATTEMPT"; then
      echo "Requested $workflow for run $SOURCE_RUN_ID, attempt $SOURCE_ATTEMPT."
      return 0
    fi
    if [[ "$attempt" -lt 3 ]]; then sleep "${DISPATCH_BACKOFF[attempt - 1]}"; fi
  done
  echo "::warning::Could not dispatch $workflow; replay it with run_id=$SOURCE_RUN_ID and attempt=$SOURCE_ATTEMPT."
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '\nReport dispatch failed: `%s`. Replay with `run_id=%s`, `attempt=%s`; do not rebuild the application.\n' \
      "$workflow" "$SOURCE_RUN_ID" "$SOURCE_ATTEMPT" >> "$GITHUB_STEP_SUMMARY"
  fi
  return 1
}

published="${FACTORY_TASK_PUBLISHED:-${FACTORY_TASK_DELIVERED:-false}}"
# Published failed work has evidence and deserves a preview attempt too.
# Keep the legacy variable for workflows pinned before failed publication.
request() {
  local workflow="$1"
  case "$workflow" in
    publish-visual-report.yml | deploy-preview.yml)
      # Requested explicitly for the same reason as the media report: a preview
      # is expected to appear after a delivery, and the workflow_run event is not
      # guaranteed for a bot-triggered continuation.
      if [[ "$published" != 'true' ]]; then
        echo "Not requesting $workflow: the task published no work."
        return 0
      fi
      ;;
  esac
  dispatch "$workflow"
}

# With workflow names, request only those: the task requests each report in a
# step of its own, so report-dispatch-gate.yml can tell which ones went out.
# Without, request every report.
if (( $# == 0 )); then
  set -- \
    report-task-progress.yml \
    report-task-usage.yml \
    publish-agent-history.yml \
    publish-retro.yml \
    publish-visual-report.yml \
    deploy-preview.yml
fi
# The interaction history and retro are worth keeping for failures and
# handoffs too, not only deliveries.
failed=0
for workflow in "$@"; do
  case "$workflow" in
    report-task-progress.yml | report-task-usage.yml | publish-agent-history.yml | \
      publish-retro.yml | publish-visual-report.yml | deploy-preview.yml) ;;
    *) echo "Unknown report workflow: $workflow" >&2; exit 2 ;;
  esac
  request "$workflow" || failed=1
done
exit "$failed"
