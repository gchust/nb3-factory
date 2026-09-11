#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: publish-template.sh <checkout> <bundle> <expected-develop-sha> <backup-branch>" >&2
  exit 2
fi
checkout="$(realpath "$1")"
bundle="$(realpath "$2")"
expected_sha="$3"
backup_branch="$4"
if [[ ! "$expected_sha" =~ ^[a-f0-9]{40}$ || ! "$backup_branch" =~ ^factory-backup/develop-[0-9]+-[0-9]+$ ]]; then
  echo "Invalid expected commit or backup branch." >&2
  exit 2
fi
cd "$checkout"
current_sha="$(git ls-remote --exit-code origin refs/heads/develop | cut -f1)"
if [[ "$current_sha" != "$expected_sha" ]]; then
  echo "develop changed during generation; refusing to overwrite it." >&2
  exit 1
fi
git bundle verify "$bundle"
git fetch --no-tags "$bundle" refs/heads/template:refs/remotes/template-refresh/template
candidate="$(git rev-parse refs/remotes/template-refresh/template)"
if [[ "$(git rev-list --count "$candidate")" != "1" ]]; then
  echo "The refreshed template must contain exactly one root commit." >&2
  exit 1
fi
for protected_path in .github .npmrc; do
  if [[ "$(git rev-parse "${expected_sha}:${protected_path}")" != "$(git rev-parse "${candidate}:${protected_path}")" ]]; then
    echo "The refreshed template changed ${protected_path}; refusing to publish." >&2
    exit 1
  fi
done

# An exact lease rejects a concurrent change. Atomic push keeps the backup and
# develop update together; a ruleset or permission rejection changes neither.
git push --atomic \
  --force-with-lease="refs/heads/develop:${expected_sha}" \
  --force-with-lease="refs/heads/${backup_branch}:" \
  origin \
  "${expected_sha}:refs/heads/${backup_branch}" \
  "${candidate}:refs/heads/develop"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "Refreshed develop: \`${candidate}\`"
    echo
    echo "Previous develop: \`${expected_sha}\`"
    echo
    echo "Backup branch: \`${backup_branch}\`"
  } >>"$GITHUB_STEP_SUMMARY"
fi
