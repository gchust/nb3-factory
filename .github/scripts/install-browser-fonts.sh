#!/usr/bin/env bash
# Run before launching Chrome on every runner that captures browser evidence.
set -euo pipefail

families="$(fc-list ':lang=zh' -f '%{family}\n' 2>/dev/null || true)"
if [[ "$families" != *'Noto Sans CJK SC'* ]]; then
  # verify-final runs this after the agent succeeded, with no checkpoint left
  # to recover from, so a mirror blip must not fail the build. apt retries each
  # download; the loop retries a failed index or install as a whole.
  apt_options=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30)
  for attempt in 1 2 3; do
    if sudo apt-get "${apt_options[@]}" update -qq &&
      sudo apt-get "${apt_options[@]}" install -y --no-install-recommends fontconfig fonts-noto-cjk; then
      break
    fi
    if (( attempt == 3 )); then
      echo 'Installing Chinese browser fonts failed after 3 attempts.' >&2
      exit 1
    fi
    echo "Installing Chinese browser fonts failed (attempt $attempt); retrying in $(( attempt * 10 )) s." >&2
    sleep $(( attempt * 10 ))
  done
fi
fc-cache -f
families="$(fc-list ':lang=zh' -f '%{family}\n')"
if [[ "$families" != *'Noto Sans CJK SC'* ]]; then
  echo 'Chinese browser fonts are unavailable; refusing to capture tofu screenshots.' >&2
  exit 1
fi
fc-match -f 'Chinese font fallback: %{family}\n' 'sans-serif:lang=zh-cn'
