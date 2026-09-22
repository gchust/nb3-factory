#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 6 ]]; then
  echo "Usage: verify-and-repair.sh <control-dir> <workspace> <task-prompt> <task-metadata> <artifact-dir> <state-dir>" >&2
  exit 2
fi
control_dir="$(realpath "$1")"
workspace="$(realpath "$2")"
task_prompt="$(realpath "$3")"
task_metadata="$(realpath "$4")"
artifact_dir="$(realpath -m "$5")"
state_dir="$(realpath -m "$6")"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$artifact_dir" "$state_dir"
checkpoint="$artifact_dir/pipeline-state.json"
state() { node "$script_dir/pipeline-state.mjs" "$1" "$checkpoint" "${@:2}"; }
state init "$task_metadata"
read -r phase verification_attempt repair_attempts < <(state read)
initial_verifications="$verification_attempt"
initial_repairs="$repair_attempts"
focused_metadata="$state_dir/focused-task.json"
state metadata "$task_metadata" "$focused_metadata"

summary() {
  printf '{"verificationAttempts":%d,"repairAttempts":%d,"finalVerificationAttempt":%d%s}\n' \
    "$((verification_attempt - initial_verifications))" "$((repair_attempts - initial_repairs))" "$verification_attempt" "${1:-}" >"$artifact_dir/repair-summary.json"
  local outcome=failed
  case "${2:-0}" in
    0) outcome=passed ;;
    20) outcome=blocked ;;
    75) outcome=handoff ;;
  esac
  state outcome "$outcome"
}
handoff() {
  trap - EXIT
  summary ',"handoff":true' 75
  echo "Runner budget reached during $phase; requesting handoff."
  exit 75
}
budget() {
  local status=0
  state budget "$1" || status=$?
  if [[ "$status" -eq 75 ]]; then handoff; fi
  if [[ "$status" -ne 0 ]]; then exit "$status"; fi
}
# A summary survives QA errors, report blocks, and every handoff path.
trap 'status=$?; summary "" "$status"' EXIT

while true; do
  if [[ "$phase" != repair ]]; then
    budget verify
    verification_attempt=$((verification_attempt + 1))
    verification_name="verify-${verification_attempt}"
    verification_log="$artifact_dir/${verification_name}.log"
    verification_artifacts="$artifact_dir/${verification_name}"
    runtime_config="$state_dir/${verification_name}.yml"
    state set "$phase" "$verification_attempt" "$repair_attempts"
    echo "::group::Verification attempt ${verification_attempt}"
    node "$control_dir/.github/scripts/create-runtime-config.mjs" \
      --output "$runtime_config" --database "$state_dir/${verification_name}/database.sqlite"
    failure_dir="$verification_artifacts/browser-acceptance"
    failure_kind=build
    repair_log="$verification_log"
    verification_passed=0
    check_status=0
    FACTORY_RETRY_FAILED_CHECK=1 FACTORY_SKIP_BROWSER=1 "$control_dir/.github/scripts/verify.sh" \
      "$workspace" "$runtime_config" "$verification_artifacts" 2>&1 | tee "$verification_log" || check_status=$?
    if [[ "$check_status" -eq 75 ]]; then echo '::endgroup::'; handoff; fi
    if [[ "$check_status" -eq 20 ]]; then echo '::endgroup::'; exit 20; fi
    if [[ "$check_status" -eq 0 ]]; then
      failure_kind=browser
      browser_status=0
      if [[ "$phase" != qa-full && -s "$focused_metadata" ]]; then
        phase=qa-focused
        state set "$phase" "$verification_attempt" "$repair_attempts"
        budget "$phase"
        failure_dir="$verification_artifacts/browser-focused"
        set +e
        "$control_dir/.github/scripts/browser-acceptance.sh" \
          "$control_dir" "$workspace" "$focused_metadata" "$runtime_config" \
          "$failure_dir" "$state_dir/${verification_name}/browser-focused" "$verification_attempt" \
          2>&1 | tee -a "$verification_log"
        browser_status=${PIPESTATUS[0]}
        set -e
        if [[ "$browser_status" -eq 0 ]]; then
          # No second build: focused operations mutate data, so only reset DB.
          runtime_config="$state_dir/${verification_name}-full.yml"
          node "$control_dir/.github/scripts/create-runtime-config.mjs" \
            --output "$runtime_config" --database "$state_dir/${verification_name}/full/database.sqlite"
          initialization_log="$verification_artifacts/full-initialize.log"
          if ! (cd "$workspace" && export APP_CONFIG_FILE="$runtime_config" NODE_ENV=test &&
            node "$control_dir/.github/scripts/timed-command.mjs" migrate pnpm migrate &&
            node "$control_dir/.github/scripts/timed-command.mjs" seed pnpm seed) \
            2>&1 | tee "$initialization_log" | tee -a "$verification_log"; then
            failure_kind=build
            repair_log="$initialization_log"
            browser_status=10
          fi
        fi
      fi
      if [[ "$browser_status" -eq 0 ]]; then
        phase=qa-full
        state set "$phase" "$verification_attempt" "$repair_attempts"
        budget "$phase"
        failure_dir="$verification_artifacts/browser-acceptance"
        started="$(date +%s)"
        set +e
        "$control_dir/.github/scripts/browser-acceptance.sh" \
          "$control_dir" "$workspace" "$task_metadata" "$runtime_config" \
          "$failure_dir" "$state_dir/${verification_name}/browser-acceptance" "$verification_attempt" \
          2>&1 | tee -a "$verification_log"
        browser_status=${PIPESTATUS[0]}
        set -e
        if [[ "$browser_status" -ne 75 ]]; then
          state set "$phase" "$verification_attempt" "$repair_attempts" "$(($(date +%s) - started))"
        fi
      fi
      if [[ "$browser_status" -eq 0 ]]; then
        verification_passed=1
      elif [[ "$browser_status" -eq 75 ]]; then
        echo '::endgroup::'
        handoff
      elif [[ "$browser_status" -ne 10 ]]; then
        echo '::endgroup::'
        echo "QA stopped with status $browser_status; no application repair requested." >&2
        exit "$browser_status"
      elif [[ "$failure_kind" == browser && -s "$failure_dir/report.json" ]]; then
        node "$control_dir/.github/scripts/qa-retest.mjs" "$task_metadata" "$failure_dir/report.json" "$focused_metadata"
        state focus "$focused_metadata"
      fi
    fi
    echo '::endgroup::'
    if [[ "$verification_passed" -eq 1 ]]; then
      phase=done
      state set "$phase" "$verification_attempt" "$repair_attempts"
      echo "Verification passed after ${verification_attempt} attempt(s) and ${repair_attempts} repair(s)."
      break
    fi
    state capture "$failure_kind" "$repair_log" "$failure_dir/report.json" "$failure_dir/application.log"
    phase=repair
  fi

  budget repair
  repair_attempts=$((repair_attempts + 1))
  state set repair "$verification_attempt" "$repair_attempts"
  repair_prompt="$state_dir/repair-${repair_attempts}.md"
  context="$artifact_dir/repair-context"
  node "$control_dir/.github/scripts/build-repair-prompt.mjs" \
    --template "$control_dir/.github/prompts/repair.md" --task "$task_prompt" \
    --log "$context/verification.log" --failure-kind "$(state failure-kind)" \
    --report "$context/report.json" --application-log "$context/application.log" \
    --retro-path "$artifact_dir/retro.json" --output "$repair_prompt"
  echo "::group::Code Agent repair ${repair_attempts}"
  set +e
  node "$control_dir/.github/scripts/run-agent.mjs" \
    --workspace "$workspace" --prompt "$repair_prompt" \
    --log "$artifact_dir/agent-repair-${repair_attempts}.jsonl" --agentDir "$state_dir/agent-repair-${repair_attempts}"
  agent_status=$?
  set -e
  echo '::endgroup::'
  if [[ "$agent_status" -eq 75 ]]; then handoff; fi
  if [[ "$agent_status" -ne 0 ]]; then exit "$agent_status"; fi
  phase=verify
  state set "$phase" "$verification_attempt" "$repair_attempts"
done
