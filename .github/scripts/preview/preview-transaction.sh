#!/usr/bin/env bash
# Each deployment gets a fresh disposable dataset. Preserve the prior tree
# (including uploads and SQLite WAL) and container until local health succeeds.
#
# The snapshot exists for this deploy's rollback only. Once the new instance is
# healthy it is removed: no later deploy reads it (each takes a snapshot of its
# own), and keeping one per redeploy left ~340 MB behind every time.
preview_begin() {
  backup=""
  previous_container="${name}-previous"
  if [[ -d "$dir" ]]; then
    backup="$(mktemp -d "$PREVIEW_ROOT/backups/pr-${pr}.XXXXXX")"
    if container_exists "$name"; then
      docker stop "$name" >/dev/null
      docker rename "$name" "$previous_container"
    fi
    mv "$dir" "$backup/instance"
    log "saved previous preview, database and uploads to $backup"
  fi
  transaction_started=true
}

# Failed deploys of this pull request, kept as failed-pr-<n>.XXXXXX for
# diagnosis. Only the newest one is worth reading: an older failure describes a
# build that was replaced since.
remove_failed_snapshots() {
  local entry
  for entry in "$PREVIEW_ROOT/backups/failed-pr-${pr}".*; do
    [[ -d "$entry" ]] || continue
    rm -rf "$entry" || log "could not remove $entry"
  done
}

preview_rollback() {
  remove_container "$name"
  # Keep failed files/logs available for diagnosis; do not count them as a slot.
  if [[ -d "$dir" ]]; then
    remove_failed_snapshots
    failed="$(mktemp -d "$PREVIEW_ROOT/backups/failed-pr-${pr}.XXXXXX")"
    mv "$dir" "$failed/instance"
  fi
  if [[ -n "$backup" && -d "$backup/instance" ]]; then
    mv "$backup/instance" "$dir"
    rmdir "$backup" 2>/dev/null || true
    if container_exists "$previous_container"; then
      docker rename "$previous_container" "$name"
      docker start "$name" >/dev/null
    fi
    log "restored previous preview after failed deployment"
  fi
}

# Ends the transaction before deleting anything: a failure while removing the
# snapshot must not roll a healthy deploy back onto a half-deleted one.
preview_commit() {
  transaction_started=false
  # The new instance is live; a container that would not go away is worth a
  # line in the log, not a failed deploy that also skips the cleanup below.
  remove_container "$previous_container" ||
    log "could not remove the previous container $previous_container"
  if [[ -n "$backup" ]]; then
    rm -rf "$backup" || log "could not remove the previous preview at $backup"
  fi
  # A successful deploy supersedes every earlier failure of this pull request.
  remove_failed_snapshots
}
