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
# recover from, so a stalled mirror must not fail the build. Every command that
# can wait is bounded, so the whole script fits the 10-minute step timeout of
# each caller; workflow-policy.test.mjs recomputes the worst case from these
# limits and requires it to leave 30 s for bash, mktemp and the like:
#   apt round: update 45 s + install 100 s, plus 10 s to kill each   = 165 s
#   each host: 5 s backoff + download 90 s + 5 s kill
#              + hash 15 s + 5 s kill + dpkg 30 s + 5 s kill          = 155 s
#   two hosts                                                        = 310 s
#   fc-cache 30 s + 5 s kill                                         =  35 s
#   three font queries (fc-list twice, fc-match) of 10 s + 5 s kill  =  45 s
#   total                                                            = 555 s
# A cached copy of the pinned package (FACTORY_FONT_DEB_CACHE, see below)
# replaces the apt round rather than adding to it: hash 15 s + 5 s kill and
# dpkg 30 s + 5 s kill = 55 s, and when it does not install only the direct
# downloads follow. Saving apt's copy into that cache hashes it once more
# (20 s), on the path where apt succeeded and no download follows.
APT_UPDATE_LIMIT=45
APT_INSTALL_LIMIT=100
APT_KILL_AFTER=10
DOWNLOAD_LIMIT=90
DOWNLOAD_KILL_AFTER=5
HASH_LIMIT=15
HASH_KILL_AFTER=5
DPKG_LIMIT=30
DPKG_KILL_AFTER=5
BACKOFF=5
FC_CACHE_LIMIT=30
FC_QUERY_LIMIT=10
FC_KILL_AFTER=5
# apt aborts a stalled connection after 15 s and retries twice, so a stuck
# mirror fails within the install limit instead of using all of it.
apt_options=(-o Acquire::Retries=2 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15)

# The task workflow restores this directory with actions/cache under a key
# naming FONT_DEB_SHA256 and saves it after a miss, so most runs skip apt (and
# its index update) entirely. Anything found there is installed only after the
# same hash check as a download. Unset, nothing is read or written.
FONT_DEB_CACHE="${FACTORY_FONT_DEB_CACHE:-}"

# The fontconfig queries: one before the install and two after it.
font_families() {
  timeout --kill-after="${FC_KILL_AFTER}s" "${FC_QUERY_LIMIT}s" fc-list ':lang=zh' -f '%{family}\n'
}

have_fonts() {
  local families
  families="$(font_families 2>/dev/null || true)"
  [[ "$families" == *'Noto Sans CJK SC'* ]]
}

install_with_apt() {
  sudo timeout --kill-after="${APT_KILL_AFTER}s" "${APT_UPDATE_LIMIT}s" apt-get "${apt_options[@]}" update -qq &&
    sudo timeout --kill-after="${APT_KILL_AFTER}s" "${APT_INSTALL_LIMIT}s" apt-get "${apt_options[@]}" install -y --no-install-recommends fontconfig fonts-noto-cjk
}

pinned() {
  echo "$FONT_DEB_SHA256  $1" |
    timeout --kill-after="${HASH_KILL_AFTER}s" "${HASH_LIMIT}s" sha256sum --check --status
}

install_deb() {
  # An apt round cut short by its timeout can leave dpkg half-configured.
  sudo timeout --kill-after="${DPKG_KILL_AFTER}s" "${DPKG_LIMIT}s" \
    sh -c 'dpkg --configure -a || true; dpkg -i "$1"' sh "$1"
}

# Keeps a verified package for the next run; failing to keep it changes nothing.
keep_in_cache() {
  [[ -n "$FONT_DEB_CACHE" ]] || return 0
  mkdir -p "$FONT_DEB_CACHE" && cp "$1" "$FONT_DEB_CACHE/$FONT_DEB" || true
}

install_cached() {
  local file="$FONT_DEB_CACHE/$FONT_DEB"
  if ! pinned "$file"; then
    echo "The cached $FONT_DEB does not match its pinned SHA-256." >&2
    return 1
  fi
  install_deb "$file"
}

# apt-get keeps the package it installed; keep it if it is the pinned one.
keep_apt_copy() {
  local file
  [[ -n "$FONT_DEB_CACHE" ]] || return 0
  for file in /var/cache/apt/archives/fonts-noto-cjk_*_all.deb; do
    [[ -f "$file" ]] || continue
    if pinned "$file"; then keep_in_cache "$file"; fi
    return 0
  done
}

# Bypasses apt and its mirror list entirely: a transfer slower than 1 MB/s for
# 20 s counts as stalled, and the file must match the pinned hash.
install_from() {
  local host="$1" file
  file="$(mktemp -d)/$FONT_DEB"
  timeout --kill-after="${DOWNLOAD_KILL_AFTER}s" "${DOWNLOAD_LIMIT}s" \
    curl -fsSL --connect-timeout 15 --speed-limit 1000000 --speed-time 20 \
    --max-time "$DOWNLOAD_LIMIT" -o "$file" "$host/$FONT_DEB_PATH" || return 1
  if ! pinned "$file"; then
    echo "Downloaded $FONT_DEB from $host does not match its pinned SHA-256." >&2
    return 1
  fi
  install_deb "$file" || return 1
  keep_in_cache "$file"
}

if ! have_fonts; then
  installed=false
  cached=false
  if [[ -n "$FONT_DEB_CACHE" && -f "$FONT_DEB_CACHE/$FONT_DEB" && ! -L "$FONT_DEB_CACHE/$FONT_DEB" ]]; then
    cached=true
    if install_cached; then
      installed=true
    else
      echo 'Installing the cached Chinese font package failed; downloading the pinned package directly.' >&2
    fi
  fi
  # A cached package that would not install takes the apt round's place in
  # the step's time budget, so only the direct downloads follow it.
  if [[ "$installed" != true && "$cached" != true ]]; then
    if install_with_apt; then
      installed=true
      keep_apt_copy
    else
      echo 'Installing Chinese browser fonts through apt failed; downloading the pinned package directly.' >&2
    fi
  fi
  if [[ "$installed" != true ]]; then
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
timeout --kill-after="${FC_KILL_AFTER}s" "${FC_CACHE_LIMIT}s" fc-cache -f
families="$(font_families)"
if [[ "$families" != *'Noto Sans CJK SC'* ]]; then
  echo 'Chinese browser fonts are unavailable; refusing to capture tofu screenshots.' >&2
  exit 1
fi
timeout --kill-after="${FC_KILL_AFTER}s" "${FC_QUERY_LIMIT}s" \
  fc-match -f 'Chinese font fallback: %{family}\n' 'sans-serif:lang=zh-cn'
