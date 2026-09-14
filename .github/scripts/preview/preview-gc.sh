#!/usr/bin/env bash
# Reclaims what previews leave behind on a host whose disk is finite.
#
# Two kinds of leftover, neither of which the per-pull-request paths can clean
# up on their own:
#
#   - dependency caches no surviving preview refers to. They are keyed by the
#     dependency set, so the entry that outlives its last user is invisible from
#     any single instance directory.
#   - containers whose instance directory is gone. A destroy that was killed
#     between removing the directory and the container leaves one running.
#
# Previews for closed pull requests are not this script's business: only the
# teardown workflow knows that a pull request was closed, and it calls
# preview-destroy.sh directly.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=preview-lib.sh
. "$script_dir/preview-lib.sh"

prune_deps=true
reap_orphans=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prune-deps) prune_deps=true; reap_orphans=false; shift ;;
    --reap-orphans) reap_orphans=true; prune_deps=false; shift ;;
    --all) prune_deps=true; reap_orphans=true; shift ;;
    -h|--help)
      cat >&2 <<'USAGE'
Usage: preview-gc.sh [--prune-deps | --reap-orphans | --all]
  (default: both)
USAGE
      exit 0
      ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_command docker
ensure_layout

exec 9>"$PREVIEW_ROOT/deploy.lock"
flock 9

if [[ "$reap_orphans" == true ]]; then
  while read -r name; do
    [[ -n "$name" ]] || continue
    pr="${name#preview-pr-}"
    if [[ ! -d "$(instance_dir "$pr")" ]]; then
      log "reaping orphaned container $name"
      docker rm --force "$name" >/dev/null
    fi
  done < <(docker ps --all --format '{{.Names}}' --filter 'name=^preview-pr-' || true)
fi

if [[ "$prune_deps" == true ]]; then
  # Every dependency set a surviving preview still points at.
  referenced="$(mktemp "$PREVIEW_TMP_DIR/referenced.XXXXXX")"
  trap 'rm -f "$referenced"' EXIT
  local_dir=""
  for local_dir in "$PREVIEW_INSTANCES_DIR"/pr-*; do
    [[ -d "$local_dir" ]] || continue
    read_instance_env "$local_dir" depsKey >>"$referenced" || true
  done

  for entry in "$PREVIEW_DEPS_DIR"/*; do
    [[ -d "$entry" ]] || continue
    key="$(basename "$entry")"
    if ! grep --quiet --line-regexp --fixed-strings "$key" "$referenced"; then
      log "pruning unreferenced dependency cache $key"
      rm -rf "$entry"
    fi
  done
fi

log "garbage collection complete"
