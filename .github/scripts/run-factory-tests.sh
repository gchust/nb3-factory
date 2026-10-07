#!/usr/bin/env bash
# Runs the factory's control-plane regression tests: every
# .github/scripts/tests/*.test.mjs, once each.
#
# Most suites only touch their own temporary directories and port-0 listeners,
# and run concurrently (node's default, one file per available core less one).
# The ones listed in SERIAL run on their own, one file at a time, after the
# rest:
#
#   - browser-acceptance runs stop-stale-app.sh, which stops every process that
#     looks like an application under test, and stale-app-port starts and kills
#     listeners on chosen ports. Nothing else may be running while they look.
#   - browser-preflight and idle-watchdog assert that a chain of short timeouts
#     ends within a second or two of wall-clock time, which a loaded machine
#     can stretch.
#
# The concurrent group runs with FACTORY_TESTS_CONCURRENT=1, and
# stop-stale-app.sh refuses to run under it, so a suite that reaches it there
# (through a copy of verify.sh or browser-acceptance.sh) fails instead of
# stopping another suite's processes. Both groups always run and the script
# fails if either did.
#
# Fixtures own their simulated Run identities, including Handoff and Re-run
# tests; the CI attempt must not become the task's attempt, hence the unset.
#
# Usage: run-factory-tests.sh [tests-directory]
set -uo pipefail

tests="${1:-$(dirname "${BASH_SOURCE[0]}")/tests}"
SERIAL=(browser-acceptance.test.mjs stale-app-port.test.mjs browser-preflight.test.mjs idle-watchdog.test.mjs)

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
env -u GITHUB_RUN_ID -u GITHUB_RUN_ATTEMPT FACTORY_TESTS_CONCURRENT=1 \
  node --test "${concurrent[@]}" || status=1
env -u GITHUB_RUN_ID -u GITHUB_RUN_ATTEMPT -u FACTORY_TESTS_CONCURRENT \
  node --test --test-concurrency=1 "${serial[@]}" || status=1
exit "$status"
