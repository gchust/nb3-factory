#!/usr/bin/env bash
# Reports how full the preview host is, before CI packages and uploads anything.
#
# A payload is up to ~84 MB packed (~744 MB unpacked) and is published as a
# public release asset before the host fetches it, so a deploy that
# preview-deploy.sh then refuses for the instance limit has already paid for
# the upload and left the asset behind. By
# 2026-10-05 that was about 82% of deploys: 49 open build pull requests were
# competing for 30 slots.
# CI asks here first, decides what may be evicted (only it can see which pull
# requests are still open), and only then publishes the payload.
#
# Output, one record per line, space-separated:
#
#   limit <n>
#   self present|absent
#   instance <pr> <deployedAt|-> <buildStatus|unknown>
#
# `self` is whether this pull request already has an instance: a redeploy
# replaces it and needs no free slot. `buildStatus` is what preview-deploy.sh
# recorded from `--build-status`; instances deployed before it was recorded say
# `unknown`.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=preview-lib.sh
. "$script_dir/preview-lib.sh"

[[ $# -eq 2 && "$1" == --pr ]] || { echo "Usage: preview-capacity.sh --pr <number>" >&2; exit 2; }
pr="$2"
require_positive_integer "$pr"

require_command flock
ensure_layout

# Read under the deploy lock, so an instance caught mid-deploy is not counted
# from a half-written preview.env. Bounded, like every wait here: CI's step
# timing out kills only the ssh client, and this would keep waiting. The wait
# matches preview-deploy.sh's, at least the longest a deploy holds the lock,
# so a deploy queued behind another one waits for it instead of failing; the
# workflow's step leaves room for it and the evictions after it.
exec 9>"$PREVIEW_ROOT/deploy.lock"
flock -w 960 9 ||
  die "another preview operation held the deploy lock for 960s; re-run Deploy Task Preview for this task run once the host is free (see PREVIEWS.md, 手动补发)"

printf 'limit %s\n' "$PREVIEW_MAX_INSTANCES"
if [[ -d "$(instance_dir "$pr")" ]]; then
  printf 'self present\n'
else
  printf 'self absent\n'
fi

for dir in "$PREVIEW_INSTANCES_DIR"/pr-*; do
  [[ -d "$dir" ]] || continue
  number="$(basename "$dir")"
  number="${number#pr-}"
  [[ "$number" =~ ^[1-9][0-9]*$ ]] || continue
  deployed="$(read_instance_env "$dir" deployedAt || true)"
  status="$(read_instance_env "$dir" buildStatus || true)"
  [[ "$deployed" =~ ^[0-9T:Z-]+$ ]] || deployed=-
  [[ "$status" == success || "$status" == failed ]] || status=unknown
  printf 'instance %s %s %s\n' "$number" "$deployed" "$status"
done
