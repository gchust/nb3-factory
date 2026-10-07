#!/usr/bin/env bash
# Runs the factory's control-plane regression tests: every
# .github/scripts/tests/*.test.mjs, once each.
#
# Most suites only touch their own temporary directories and port-0 listeners,
# and run concurrently (node's default, one file per available core less one).
# The ones listed in SERIAL touch the machine's process table: browser
# acceptance runs stop-stale-app.sh, which stops every process that looks like
# an application under test, and stale-app-port starts and kills listeners on
# chosen ports. They run on their own, one file at a time, after the rest, so
# nothing else is listening or running while they look. Both groups always run
# and the script fails if either did.
#
# Fixtures own their simulated Run identities, including Handoff and Re-run
# tests; the CI attempt must not become the task's attempt, hence the unset.
#
# Usage: run-factory-tests.sh [tests-directory]
set -uo pipefail

tests="${1:-$(dirname "${BASH_SOURCE[0]}")/tests}"
SERIAL=(browser-acceptance.test.mjs stale-app-port.test.mjs)

concurrent=()
serial=()
for file in "$tests"/*.test.mjs; do
  name="$(basename "$file")"
  if [[ " ${SERIAL[*]} " == *" $name "* ]]; then
    serial+=("$file")
  else
    concurrent+=("$file")
  fi
done
(( ${#serial[@]} == ${#SERIAL[@]} )) || {
  echo "::error::a serial suite is missing from $tests: ${SERIAL[*]}" >&2
  exit 2
}

status=0
env -u GITHUB_RUN_ID -u GITHUB_RUN_ATTEMPT node --test "${concurrent[@]}" || status=1
env -u GITHUB_RUN_ID -u GITHUB_RUN_ATTEMPT node --test --test-concurrency=1 "${serial[@]}" || status=1
exit "$status"
