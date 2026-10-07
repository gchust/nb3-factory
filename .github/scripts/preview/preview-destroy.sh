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

# Deploys, capacity checks and gc all hold this lock, so nothing is mid-deploy
# while the instance is removed. A deploy whose CI step was cut off may still be
# fetching or waiting for this lock; the mark written under it makes that
# deploy refuse once it gets the lock, instead of bringing the preview back.
# Bounded: a deploy holds the lock for about 14.5 minutes at most (migrations,
# start and readiness; see the budget in preview-deploy.sh), and the teardown
# job retries this three times inside its 20-minute limit, so waiting 3
# minutes each time fails visibly rather than being cut off.
require_command flock
exec 9>"$PREVIEW_ROOT/deploy.lock"
flock -w 180 9 || die "another preview operation still holds the deploy lock; PR #$pr's preview was not removed"
mark_closed "$pr"

# The staged payloads belong to this pull request and are fetched again on the
# next deploy. Removed before the early exit below, because a fetch that failed
# leaves a payload (or a `.part`) behind with no preview to go with it.
remove_payloads "$pr"

if ! container_exists "$name" && [[ ! -d "$dir" ]]; then
  log "PR #$pr has no preview; nothing to do"
  exit 0
fi

remove_container "$name"
rm -rf "$dir"
log "removed the preview for PR #$pr"
