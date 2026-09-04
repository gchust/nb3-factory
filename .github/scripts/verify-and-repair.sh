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

while true; do
  verification_name="verify-${verification_attempt}"
  verification_log="$artifact_dir/${verification_name}.log"
  verification_artifacts="$artifact_dir/${verification_name}"
  runtime_config="$state_dir/${verification_name}.yml"
  database="$state_dir/${verification_name}/database.sqlite"

  echo "::group::Verification attempt ${verification_attempt}"
  node "$control_dir/.github/scripts/create-runtime-config.mjs" \
    --output "$runtime_config" \
    --database "$database"

  verification_passed=0
  if FACTORY_SKIP_BROWSER=1 "$control_dir/.github/scripts/verify.sh" \
    "$workspace" \
    "$runtime_config" \
    "$verification_artifacts" \
    2>&1 | tee "$verification_log"; then
    set +e
    "$control_dir/.github/scripts/browser-acceptance.sh" \
      "$control_dir" \
      "$workspace" \
      "$task_metadata" \
      "$runtime_config" \
      "$verification_artifacts/browser-acceptance" \
      "$state_dir/${verification_name}/browser-acceptance" \
      "$verification_attempt" \
      2>&1 | tee -a "$verification_log"
    browser_status=${PIPESTATUS[0]}
    set -e

    if [[ "$browser_status" -eq 0 ]]; then
      verification_passed=1
    elif [[ "$browser_status" -ne 10 ]]; then
      echo "::endgroup::"
      echo "Agent Browser acceptance infrastructure failed with status ${browser_status}; application repair was not attempted." >&2
      exit "$browser_status"
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
  echo "Verification attempt ${verification_attempt} failed; starting Pi repair ${verification_attempt}."
  node "$control_dir/.github/scripts/build-repair-prompt.mjs" \
    --template "$control_dir/.github/prompts/repair.md" \
    --task "$task_prompt" \
    --log "$verification_log" \
    --output "$repair_prompt"

  echo "::group::Pi repair ${verification_attempt}"
  node "$control_dir/.github/scripts/run-pi.mjs" \
    --workspace "$workspace" \
    --prompt "$repair_prompt" \
    --log "$artifact_dir/pi-repair-${verification_attempt}.jsonl" \
    --agentDir "$state_dir/pi-repair-${verification_attempt}"
  echo "::endgroup::"

  verification_attempt=$((verification_attempt + 1))
done
