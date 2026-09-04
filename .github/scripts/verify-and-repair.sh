#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 5 ]]; then
  echo "Usage: verify-and-repair.sh <control-dir> <workspace> <task-prompt> <artifact-dir> <state-dir>" >&2
  exit 2
fi

control_dir="$(realpath "$1")"
workspace="$(realpath "$2")"
task_prompt="$(realpath "$3")"
artifact_dir="$(realpath -m "$4")"
state_dir="$(realpath -m "$5")"
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

  if "$control_dir/.github/scripts/verify.sh" \
    "$workspace" \
    "$runtime_config" \
    "$verification_artifacts" \
    2>&1 | tee "$verification_log"; then
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
