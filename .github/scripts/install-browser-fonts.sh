#!/usr/bin/env bash
# Run before launching Chrome on every runner that captures browser evidence.
set -euo pipefail

# The exact noble package, verified against its hash in
# dists/noble/main/binary-amd64/Packages (Size 61229778), so the fallback
# below installs the same file apt would.
FONT_DEB=fonts-noto-cjk_20230817+repack1-3_all.deb
FONT_DEB_SHA256=7d64b985f6fe128c99eae5610d5c047338e572bdcfb2bb09736be01b824a7f6c
FONT_DEB_PATH="pool/main/f/fonts-noto-cjk/$FONT_DEB"
# Hosts other than the runner's own apt mirror, tried in this order.
FONT_DEB_HOSTS=(http://archive.ubuntu.com/ubuntu http://mirrors.edge.kernel.org/ubuntu)

# verify-final runs this after the agent succeeded, with no checkpoint left to
# recover from, so a stalled mirror must not fail the build. The whole script
# fits the 10-minute step timeout of each caller; workflow-policy.test.mjs
# recomputes the worst case from these limits:
#   apt round: update 60 s + install 120 s, plus 10 s to kill each   = 200 s
#   each host: 5 s backoff + download 100 s + 5 s kill + dpkg 45 s + 5 s = 160 s
#   two hosts                                                        = 320 s
#   total                                                            = 520 s
APT_UPDATE_LIMIT=60
APT_INSTALL_LIMIT=120
APT_KILL_AFTER=10
DOWNLOAD_LIMIT=100
DOWNLOAD_KILL_AFTER=5
DPKG_LIMIT=45
DPKG_KILL_AFTER=5
BACKOFF=5
# apt aborts a stalled connection after 15 s and retries twice, so a stuck
# mirror fails within the install limit instead of using all of it.
apt_options=(-o Acquire::Retries=2 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15)

have_fonts() {
  local families
  families="$(fc-list ':lang=zh' -f '%{family}\n' 2>/dev/null || true)"
  [[ "$families" == *'Noto Sans CJK SC'* ]]
}

install_with_apt() {
  sudo timeout --kill-after="${APT_KILL_AFTER}s" "${APT_UPDATE_LIMIT}s" apt-get "${apt_options[@]}" update -qq &&
    sudo timeout --kill-after="${APT_KILL_AFTER}s" "${APT_INSTALL_LIMIT}s" apt-get "${apt_options[@]}" install -y --no-install-recommends fontconfig fonts-noto-cjk
}

# Bypasses apt and its mirror list entirely: a transfer slower than 1 MB/s for
# 20 s counts as stalled, and the file must match the pinned hash.
install_from() {
  local host="$1" file
  file="$(mktemp -d)/$FONT_DEB"
  timeout --kill-after="${DOWNLOAD_KILL_AFTER}s" "${DOWNLOAD_LIMIT}s" \
    curl -fsSL --connect-timeout 15 --speed-limit 1000000 --speed-time 20 \
    --max-time "$DOWNLOAD_LIMIT" -o "$file" "$host/$FONT_DEB_PATH" || return 1
  if ! echo "$FONT_DEB_SHA256  $file" | sha256sum --check --status; then
    echo "Downloaded $FONT_DEB from $host does not match its pinned SHA-256." >&2
    return 1
  fi
  # An apt round cut short by its timeout can leave dpkg half-configured.
  sudo timeout --kill-after="${DPKG_KILL_AFTER}s" "${DPKG_LIMIT}s" \
    sh -c 'dpkg --configure -a || true; dpkg -i "$1"' sh "$file"
}

if ! have_fonts; then
  if ! install_with_apt; then
    echo 'Installing Chinese browser fonts through apt failed; downloading the pinned package directly.' >&2
    installed=false
    for host in "${FONT_DEB_HOSTS[@]}"; do
      sleep "$BACKOFF"
      if install_from "$host"; then
        installed=true
        break
      fi
      echo "Installing $FONT_DEB from $host failed." >&2
    done
    if [[ "$installed" != true ]]; then
      echo 'Installing Chinese browser fonts failed through apt and every direct download.' >&2
      exit 1
    fi
  fi
fi
fc-cache -f
families="$(fc-list ':lang=zh' -f '%{family}\n')"
if [[ "$families" != *'Noto Sans CJK SC'* ]]; then
  echo 'Chinese browser fonts are unavailable; refusing to capture tofu screenshots.' >&2
  exit 1
fi
fc-match -f 'Chinese font fallback: %{family}\n' 'sans-serif:lang=zh-cn'
