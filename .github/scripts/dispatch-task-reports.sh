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
# reports and a comment round's queue request take 490 s, inside the 10-minute
# dispatch-reports job in code-agent-task.yml. task-report-dispatch.test.mjs
# checks that budget.
DISPATCH_ATTEMPT_TIMEOUT=15s
DISPATCH_KILL_AFTER=5s
DISPATCH_BACKOFF=(2 8)
dispatch() {
  local workflow="$1"
  local fields=(--field "run_id=$SOURCE_RUN_ID" --field "attempt=$SOURCE_ATTEMPT")
  # The comment queue reconciles one Issue once this run has completed.
  if [[ "$workflow" == comment-build-queue.yml ]]; then
    fields=(--field "issue_number=$ISSUE_NUMBER" --field "run_id=$SOURCE_RUN_ID")
  fi
  for attempt in 1 2 3; do
    if timeout --kill-after="$DISPATCH_KILL_AFTER" "$DISPATCH_ATTEMPT_TIMEOUT" gh workflow run "$workflow" \
      --repo "$GITHUB_REPOSITORY" --ref "$FACTORY_REPORT_REF" "${fields[@]}"; then
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

# Published failed work has evidence and deserves a preview attempt too.
published="${FACTORY_TASK_PUBLISHED:-false}"
# A rejected GitHub Re-run did no work: its attempt has no usage, history or
# retro of its own, and a report for it would rank as the Issue's latest and
# replace the real one. Only the progress line is updated. The step still
# succeeds, so report-dispatch-gate.yml counts it as handled and the
# workflow_run copy does not publish the empty report instead.
rerun_rejected="${FACTORY_RERUN_REJECTED:-false}"
request() {
  local workflow="$1"
  if [[ "$rerun_rejected" == 'true' && "$workflow" != report-task-progress.yml && "$workflow" != comment-build-queue.yml ]]; then
    echo "Not requesting $workflow: attempt $SOURCE_ATTEMPT was a rejected GitHub Re-run."
    return 0
  fi
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

# The task requests each report in a step of its own, so
# report-dispatch-gate.yml can tell which ones went out. The dispatcher is
# checked out at the calling workflow's own commit, so every caller names its
# workflows.
if (( $# == 0 )); then
  echo "Name the report workflows to request." >&2
  exit 2
fi
# The interaction history and retro are worth keeping for failures and
# handoffs too, not only deliveries.
failed=0
for workflow in "$@"; do
  case "$workflow" in
    report-task-progress.yml | report-task-usage.yml | publish-agent-history.yml | \
      publish-retro.yml | publish-visual-report.yml | deploy-preview.yml) ;;
    comment-build-queue.yml)
      if [[ ! "${ISSUE_NUMBER:-}" =~ ^[1-9][0-9]*$ ]]; then
        echo "comment-build-queue.yml needs ISSUE_NUMBER." >&2
        exit 2
      fi
      ;;
    *) echo "Unknown report workflow: $workflow" >&2; exit 2 ;;
  esac
  request "$workflow" || failed=1
done
exit "$failed"
