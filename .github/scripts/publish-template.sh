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

# The bundle carries a root commit so it holds nothing but the generated tree.
# Publish that tree as a new commit on top of the develop it was generated
# from: replacing develop with the root commit discarded its history and left
# in-flight task branches with no common history for their pull requests.
published="$(
  git log -1 --format=%B "$candidate" |
    GIT_AUTHOR_NAME="$(git log -1 --format=%an "$candidate")" \
    GIT_AUTHOR_EMAIL="$(git log -1 --format=%ae "$candidate")" \
    GIT_AUTHOR_DATE="$(git log -1 --format=%aI "$candidate")" \
    GIT_COMMITTER_NAME="$(git log -1 --format=%cn "$candidate")" \
    GIT_COMMITTER_EMAIL="$(git log -1 --format=%ce "$candidate")" \
    GIT_COMMITTER_DATE="$(git log -1 --format=%cI "$candidate")" \
    git commit-tree "${candidate}^{tree}" -p "$expected_sha" -F -
)"

# An exact lease rejects a concurrent change. Atomic push keeps the backup and
# develop update together; a ruleset or permission rejection changes neither.
git push --atomic \
  --force-with-lease="refs/heads/develop:${expected_sha}" \
  --force-with-lease="refs/heads/${backup_branch}:" \
  origin \
  "${expected_sha}:refs/heads/${backup_branch}" \
  "${published}:refs/heads/develop"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "Refreshed develop: \`${published}\`"
    echo
    echo "Previous develop: \`${expected_sha}\`"
    echo
    echo "Backup branch: \`${backup_branch}\`"
  } >>"$GITHUB_STEP_SUMMARY"
fi
