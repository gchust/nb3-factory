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
mkdir -p "$artifact_dir" "$state_dir"

verification_attempt=1
focused_metadata="$state_dir/focused-task.json"

while true; do
  verification_name="verify-${verification_attempt}"
  verification_log="$artifact_dir/${verification_name}.log"
  verification_artifacts="$artifact_dir/${verification_name}"
  repair_log="$verification_log"
  runtime_config="$state_dir/${verification_name}.yml"
  database="$state_dir/${verification_name}/database.sqlite"

  echo "::group::Verification attempt ${verification_attempt}"
  node "$control_dir/.github/scripts/create-runtime-config.mjs" \
    --output "$runtime_config" \
    --database "$database"

  failure_dir="$verification_artifacts/browser-acceptance"
  failure_kind=build
  verification_passed=0
  if FACTORY_RETRY_FAILED_CHECK=1 FACTORY_SKIP_BROWSER=1 "$control_dir/.github/scripts/verify.sh" \
    "$workspace" \
    "$runtime_config" \
    "$verification_artifacts" \
    2>&1 | tee "$verification_log"; then
    failure_kind=browser
    browser_status=0
    failure_dir="$verification_artifacts/browser-acceptance"
    if [[ -s "$focused_metadata" ]]; then
      failure_dir="$verification_artifacts/browser-focused"
      set +e
      "$control_dir/.github/scripts/browser-acceptance.sh" \
        "$control_dir" "$workspace" "$focused_metadata" "$runtime_config" \
        "$failure_dir" "$state_dir/${verification_name}/browser-focused" "$verification_attempt" \
        2>&1 | tee -a "$verification_log"
      browser_status=${PIPESTATUS[0]}
      set -e
      if [[ "$browser_status" -eq 0 ]]; then
        # Focused browser operations mutate test data. Full QA starts clean,
        # without rebuilding the identical application or reinstalling packages.
        runtime_config="$state_dir/${verification_name}-full.yml"
        node "$control_dir/.github/scripts/create-runtime-config.mjs" \
          --output "$runtime_config" --database "$state_dir/${verification_name}/full/database.sqlite"
        initialization_log="$verification_artifacts/full-initialize.log"
        if (cd "$workspace" && export APP_CONFIG_FILE="$runtime_config" NODE_ENV=test &&
          node "$control_dir/.github/scripts/timed-command.mjs" migrate pnpm migrate &&
          node "$control_dir/.github/scripts/timed-command.mjs" seed pnpm seed) \
          2>&1 | tee "$initialization_log" | tee -a "$verification_log"; then
          failure_dir="$verification_artifacts/browser-acceptance"
        else
          failure_kind=build
          repair_log="$initialization_log"
          browser_status=10
        fi
      fi
    fi
    if [[ "$browser_status" -eq 0 ]]; then
      set +e
      "$control_dir/.github/scripts/browser-acceptance.sh" \
        "$control_dir" "$workspace" "$task_metadata" "$runtime_config" \
        "$failure_dir" "$state_dir/${verification_name}/browser-acceptance" "$verification_attempt" \
        2>&1 | tee -a "$verification_log"
      browser_status=${PIPESTATUS[0]}
      set -e
    fi
    if [[ "$browser_status" -eq 0 ]]; then
      verification_passed=1
    elif [[ "$browser_status" -ne 10 ]]; then
      echo "::endgroup::"
      echo "Agent Browser infrastructure failed with status ${browser_status}." >&2
      exit "$browser_status"
    elif [[ "$failure_kind" == browser && -s "$failure_dir/report.json" ]]; then
      node "$control_dir/.github/scripts/qa-retest.mjs" \
        "$task_metadata" "$failure_dir/report.json" "$focused_metadata"
    fi
  fi

  if [[ "$verification_passed" -eq 1 ]]; then
    echo "::endgroup::"
    repair_attempts=$((verification_attempt - 1))
    printf '{"verificationAttempts":%d,"repairAttempts":%d}\n' \
      "$verification_attempt" \
      "$repair_attempts" \
      >"$artifact_dir/repair-summary.json"
    echo "Verification passed after ${verification_attempt} attempt(s) and ${repair_attempts} repair(s)."
    break
  fi
  echo "::endgroup::"

  repair_prompt="$state_dir/repair-${verification_attempt}.md"
  echo "Verification attempt ${verification_attempt} failed; starting Code Agent repair ${verification_attempt}."
  node "$control_dir/.github/scripts/build-repair-prompt.mjs" \
    --template "$control_dir/.github/prompts/repair.md" \
    --task "$task_prompt" \
    --log "$repair_log" \
    --failure-kind "$failure_kind" \
    --report "$failure_dir/report.json" \
    --application-log "$failure_dir/application.log" \
    --retro-path "$artifact_dir/retro.json" \
    --output "$repair_prompt"

  echo "::group::Code Agent repair ${verification_attempt}"
  set +e
  node "$control_dir/.github/scripts/run-agent.mjs" \
    --workspace "$workspace" \
    --prompt "$repair_prompt" \
    --log "$artifact_dir/agent-repair-${verification_attempt}.jsonl" \
    --agentDir "$state_dir/agent-repair-${verification_attempt}"
  agent_status=$?
  set -e
  echo "::endgroup::"

  if [[ "$agent_status" -eq 75 ]]; then
    printf '{"verificationAttempts":%d,"repairAttempts":%d,"handoff":true}\n' \
      "$verification_attempt" \
      "$verification_attempt" \
      >"$artifact_dir/repair-summary.json"
    echo "Runner budget reached during repair ${verification_attempt}; requesting handoff."
    exit 75
  fi
  if [[ "$agent_status" -ne 0 ]]; then
    exit "$agent_status"
  fi

  verification_attempt=$((verification_attempt + 1))
done
