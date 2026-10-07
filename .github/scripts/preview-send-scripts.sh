#!/usr/bin/env bash
# Sends the host scripts of this checkout to the preview host.
#
# The host always runs the scripts from this repository, so a fix is deployed
# by pushing, never by editing files on the machine. Deploys and teardowns both
# send them first: a teardown that ran whatever an earlier deploy left there
# would miss a fix to preview-destroy.sh or preview-lib.sh until the next
# deploy. These are kilobytes; the payload is what is too big to come this way.
#
# Usage: preview-send-scripts.sh <scripts-directory>
# Needs PREVIEW_HOST, PREVIEW_USER and RUNNER_TEMP, and the key and host key
# preview-connect.sh installs.
set -euo pipefail
: "${PREVIEW_HOST:?}" "${PREVIEW_USER:?}" "${RUNNER_TEMP:?}"
source_dir="${1:?Usage: preview-send-scripts.sh <scripts-directory>}"
[[ -f "$source_dir/preview-lib.sh" ]] || { echo "::error::no preview scripts in $source_dir" >&2; exit 2; }

ssh_opts=(-i ~/.ssh/preview_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
remote="$PREVIEW_USER@$PREVIEW_HOST"
archive="$RUNNER_TEMP/preview-scripts.tar.gz"

tar -czf "$archive" -C "$source_dir" .
ssh -n "${ssh_opts[@]}" "$remote" 'mkdir -p /srv/nb3-preview/scripts /srv/nb3-preview/tmp'
scp -q "${ssh_opts[@]}" "$archive" "$remote:/srv/nb3-preview/tmp/scripts.tar.gz"
ssh -n "${ssh_opts[@]}" "$remote" \
  'tar -xzf /srv/nb3-preview/tmp/scripts.tar.gz -C /srv/nb3-preview/scripts && chmod +x /srv/nb3-preview/scripts/*.sh'
