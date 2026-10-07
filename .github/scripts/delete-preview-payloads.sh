#!/usr/bin/env bash
# Deletes the temporary payload assets one pull request published to the
# preview release. Used when the pull request closes and when its preview is
# evicted: the assets are public, and nothing is serving them any more. After
# a successful deploy it runs with --keep, to delete that pull request's
# earlier payloads and keep the one just deployed.
#
# Usage: delete-preview-payloads.sh <pr-number> [--keep <asset-name>]
# Needs GH_TOKEN, GITHUB_REPOSITORY and PREVIEW_RELEASE.
set -euo pipefail

pr="${1:-}"
[[ "$pr" =~ ^[1-9][0-9]*$ ]] || { echo "::error::unexpected pull request number" >&2; exit 2; }
keep=""
if [[ $# -gt 1 ]]; then
  [[ $# -eq 3 && "$2" == --keep && "$3" =~ ^preview-pr-$pr-[0-9a-f]{16}\.tar\.gz$ ]] ||
    { echo "::error::usage: delete-preview-payloads.sh <pr-number> [--keep preview-pr-<pr>-<digest>.tar.gz]" >&2; exit 2; }
  keep="$3"
fi

# Only a missing release means there is nothing to delete. Any other failure
# (authentication, network, rate limit) would otherwise leave public assets
# behind a green run, so it fails.
errors="$(mktemp)"
trap 'rm -f "$errors"' EXIT
if ! release="$(gh api "repos/$GITHUB_REPOSITORY/releases/tags/$PREVIEW_RELEASE" \
  --jq '.id' 2>"$errors" </dev/null)"; then
  error="$(tr '\n' ' ' <"$errors")"
  if [[ "$error" == *'Not Found'* || "$error" == *'HTTP 404'* ]]; then
    echo "no preview release; nothing to delete"
    exit 0
  fi
  echo "::error::Could not list the $PREVIEW_RELEASE assets of PR #$pr: ${error:-gh failed}" >&2
  exit 1
fi
# The release object lists its assets but does not page them; the assets
# endpoint does, and with one asset per deployed payload a busy release can
# hold more than one page.
if ! names="$(gh api --paginate "repos/$GITHUB_REPOSITORY/releases/$release/assets?per_page=100" \
  --jq '.[].name' 2>"$errors" </dev/null)"; then
  echo "::error::Could not list the $PREVIEW_RELEASE assets of PR #$pr: $(tr '\n' ' ' <"$errors")" >&2
  exit 1
fi
# There is one asset per deployed payload, not one per pull request.
# `preview-pr-7.tar.gz` is the name the first version of the deploy workflow
# used; a payload published before the digest naming may still be here.
mapfile -t assets < <(printf '%s\n' "$names" \
  | grep -E "^preview-pr-$pr(-[0-9a-f]{16})?\.tar\.gz$" \
  | grep -vxF -e "${keep:-/}" || true)
if (( ${#assets[@]} == 0 )); then
  echo "no ${keep:+other }payload asset for PR #$pr; nothing to delete"
  exit 0
fi
for asset in "${assets[@]}"; do
  gh release delete-asset "$PREVIEW_RELEASE" "$asset" \
    --repo "$GITHUB_REPOSITORY" --yes </dev/null
  echo "deleted $asset"
done
