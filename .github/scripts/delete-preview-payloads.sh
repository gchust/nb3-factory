#!/usr/bin/env bash
# Deletes every temporary payload asset one pull request published to the
# preview release. Used when the pull request closes and when its preview is
# evicted: the assets are public, and nothing is serving them any more.
#
# Usage: delete-preview-payloads.sh <pr-number>
# Needs GH_TOKEN, GITHUB_REPOSITORY and PREVIEW_RELEASE.
set -euo pipefail

pr="${1:-}"
[[ "$pr" =~ ^[1-9][0-9]*$ ]] || { echo "::error::unexpected pull request number" >&2; exit 2; }

# Only a missing release means there is nothing to delete. Any other failure
# (authentication, network, rate limit) would otherwise leave public assets
# behind a green run, so it fails.
errors="$(mktemp)"
trap 'rm -f "$errors"' EXIT
if ! names="$(gh release view "$PREVIEW_RELEASE" --repo "$GITHUB_REPOSITORY" \
  --json assets --jq '.assets[].name' 2>"$errors" </dev/null)"; then
  error="$(tr '\n' ' ' <"$errors")"
  if [[ "$error" == *'release not found'* ]]; then
    echo "no preview release; nothing to delete"
    exit 0
  fi
  echo "::error::Could not list the $PREVIEW_RELEASE assets of PR #$pr: ${error:-gh failed}" >&2
  exit 1
fi
# There is one asset per deployed payload, not one per pull request.
# `preview-pr-7.tar.gz` is the name the first version of the deploy workflow
# used; a payload published before the digest naming may still be here.
mapfile -t assets < <(printf '%s\n' "$names" \
  | grep -E "^preview-pr-$pr(-[0-9a-f]{16})?\.tar\.gz$" || true)
if (( ${#assets[@]} == 0 )); then
  echo "no payload asset for PR #$pr; nothing to delete"
  exit 0
fi
for asset in "${assets[@]}"; do
  gh release delete-asset "$PREVIEW_RELEASE" "$asset" \
    --repo "$GITHUB_REPOSITORY" --yes </dev/null
  echo "deleted $asset"
done
