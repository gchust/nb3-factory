#!/usr/bin/env bash
# Each deployment gets a fresh disposable dataset. Preserve the prior tree
# (including uploads and SQLite WAL) and container until local health succeeds.
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

preview_rollback() {
  remove_container "$name"
  # Keep failed files/logs available for diagnosis; do not count them as a slot.
  if [[ -d "$dir" ]]; then
    failed="$(mktemp -d "$PREVIEW_ROOT/backups/failed-pr-${pr}.XXXXXX")"
    mv "$dir" "$failed/instance"
  fi
  if [[ -n "$backup" && -d "$backup/instance" ]]; then
    mv "$backup/instance" "$dir"
    if container_exists "$previous_container"; then
      docker rename "$previous_container" "$name"
      docker start "$name" >/dev/null
    fi
    log "restored previous preview after failed deployment"
  fi
}

preview_commit() {
  remove_container "$previous_container"
  transaction_started=false
}
