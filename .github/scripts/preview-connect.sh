#!/usr/bin/env bash
# Tailnet membership can precede SSH reachability. Bound retries and preserve
# diagnostics; never publish a payload until key authentication also works.
set -euo pipefail
: "${PREVIEW_HOST:?}" "${PREVIEW_USER:?}" "${PREVIEW_SSH_KEY:?}"
mkdir -p ~/.ssh
chmod 700 ~/.ssh
printf '%s\n' "$PREVIEW_SSH_KEY" > ~/.ssh/preview_key
chmod 600 ~/.ssh/preview_key
scan_file="$(mktemp)"
trap 'rm -f "$scan_file"' EXIT
for attempt in 1 2 3 4 5 6; do
  echo "Checking preview SSH connectivity (attempt $attempt/6)"
  if ssh-keyscan -T 10 -H "$PREVIEW_HOST" > "$scan_file" && test -s "$scan_file"; then
    cat "$scan_file" >> ~/.ssh/known_hosts
    if ssh -i ~/.ssh/preview_key -o BatchMode=yes -o IdentitiesOnly=yes \
      -o StrictHostKeyChecking=yes -o ConnectTimeout=15 \
      "$PREVIEW_USER@$PREVIEW_HOST" true; then
      exit 0
    fi
  fi
  if [[ "$attempt" != 6 ]]; then sleep 5; fi
done
echo '::error::Preview SSH connection failed. Check host availability, port 22, tailnet ACLs and deploy-key authorization.'
tailscale status || true
exit 1
