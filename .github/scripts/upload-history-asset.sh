#!/usr/bin/env bash
# Uploads one history archive to this month's history release and prints its
# download URL. A GitHub release holds at most 1000 assets and the publishers
# add about fifteen a day, so each UTC month gets its own release,
# `factory-history-YYYY-MM`. Archives published before the rotation stay on
# the original `factory-history` release, and the links already posted keep
# working; readers accept both tags (agent-history.mjs HISTORY_ASSET_URL).
#
# Usage: upload-history-asset.sh <file> <release notes>
# Needs GH_TOKEN and GITHUB_REPOSITORY. FACTORY_HISTORY_MONTH (YYYY-MM)
# overrides the month, for tests.
set -euo pipefail

file="${1:?archive path}"
notes="${2:?release notes}"
month="${FACTORY_HISTORY_MONTH:-$(date -u +%Y-%m)}"
[[ "$month" =~ ^[0-9]{4}-(0[1-9]|1[0-2])$ ]] || { echo "::error::unexpected history month" >&2; exit 2; }
tag="factory-history-$month"

# Three workflows publish history under different concurrency groups, so two
# of them can both find the month's release missing. The loser's create fails
# because the release now exists; it then uses that release.
if ! gh release view "$tag" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
  if ! gh release create "$tag" --repo "$GITHUB_REPOSITORY" --prerelease \
    --title "工厂运行历史 $month" --notes "$notes" >/dev/null; then
    gh release view "$tag" --repo "$GITHUB_REPOSITORY" >/dev/null
  fi
fi
gh release upload "$tag" "$file" --repo "$GITHUB_REPOSITORY" --clobber >&2
echo "https://github.com/$GITHUB_REPOSITORY/releases/download/$tag/$(basename "$file")"
