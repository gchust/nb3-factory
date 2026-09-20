#!/usr/bin/env bash
# Removes one pull request's preview: its container, its staged payload, and its
# instance directory.
#
# The shared dependency cache is deliberately left alone. It is keyed by the
# dependency set rather than by pull request, so other previews are very likely
# using the same entry; `preview-gc.sh --prune-deps` reclaims unreferenced ones.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=preview-lib.sh
. "$script_dir/preview-lib.sh"

[[ $# -eq 1 ]] || { echo "Usage: preview-destroy.sh <pr-number>" >&2; exit 2; }
pr="$1"
require_positive_integer "$pr"

require_command docker

ensure_layout

name="$(container_name "$pr")"
dir="$(instance_dir "$pr")"

# The staged payload belongs to this pull request and is fetched again on the
# next deploy. Removed before the early exit below, because a fetch that failed
# leaves a payload (or a `.part`) behind with no preview to go with it.
rm -f "$(payload_path "$pr")" "$(payload_path "$pr").part"

if ! container_exists "$name" && [[ ! -d "$dir" ]]; then
  log "PR #$pr has no preview; nothing to do"
  exit 0
fi

remove_container "$name"
rm -rf "$dir"
log "removed the preview for PR #$pr"
