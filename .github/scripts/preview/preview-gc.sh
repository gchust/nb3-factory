#!/usr/bin/env bash
# Reclaims what previews leave behind on a host whose disk is finite.
#
# Three kinds of leftover, none of which the per-pull-request paths can clean up
# on their own:
#
#   - dependency caches no surviving preview refers to. They are keyed by the
#     dependency set, so the entry that outlives its last user is invisible from
#     any single instance directory.
#   - containers whose instance directory is gone. A destroy that was killed
#     between removing the directory and the container leaves one running.
#   - backups whose preview is gone. Every deploy moves the previous instance
#     aside — database, uploads, application — and a preview is deployed more
#     than once, so a pull request that was live for a few days leaves several
#     ~340 MB of them. `preview-destroy.sh` removes the instance and never the
#     backups, because they are what a failed deploy rolls back to. Nothing
#     else reclaims them either: on 2026-09-22 this directory held 1.5 GB, of
#     which all but one entry belonged to a preview that no longer existed.
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
prune_backups=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prune-deps) prune_deps=true; reap_orphans=false; prune_backups=false; shift ;;
    --reap-orphans) reap_orphans=true; prune_deps=false; prune_backups=false; shift ;;
    --prune-backups) prune_backups=true; prune_deps=false; reap_orphans=false; shift ;;
    --all) prune_deps=true; reap_orphans=true; prune_backups=true; shift ;;
    -h|--help)
      cat >&2 <<'USAGE'
Usage: preview-gc.sh [--prune-deps | --reap-orphans | --prune-backups | --all]
  (default: all three)
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

if [[ "$prune_backups" == true ]]; then
  # A backup is a snapshot of one pull request's instance, named `pr-<n>.XXXXXX`,
  # or `failed-pr-<n>.XXXXXX` for one whose deploy failed after it was taken.
  # The pull request number is the whole of its identity, so the question "does
  # this belong to a preview" is answered by the instance directory and nothing
  # else — no age heuristic, because a preview can legitimately sit unopened for
  # weeks and its backups are what a failed redeploy rolls back to.
  #
  # `cloudflare-*` and anything else without that shape is left alone: this
  # script knows what it writes, and guessing at the rest is how a cleanup
  # removes something someone needed.
  for entry in "$PREVIEW_ROOT/backups"/*; do
    [[ -d "$entry" ]] || continue
    name="$(basename "$entry")"
    pr="$(sed -nE 's/^(failed-)?pr-([1-9][0-9]*)\.[A-Za-z0-9]+$/\2/p' <<<"$name")"
    if [[ -z "$pr" ]]; then
      log "keeping $name: not a preview snapshot"
      continue
    fi
    if [[ -d "$(instance_dir "$pr")" ]]; then
      log "keeping $name: PR #$pr still has a preview"
      continue
    fi
    log "removing backup $name: PR #$pr has no preview"
    rm -rf "$entry"
  done
fi

log "garbage collection complete"
