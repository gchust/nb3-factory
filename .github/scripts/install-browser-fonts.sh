#!/usr/bin/env bash
# Run before launching Chrome on every runner that captures browser evidence.
set -euo pipefail

families="$(fc-list ':lang=zh' -f '%{family}\n' 2>/dev/null || true)"
if [[ "$families" != *'Noto Sans CJK SC'* ]]; then
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends fontconfig fonts-noto-cjk
fi
fc-cache -f
families="$(fc-list ':lang=zh' -f '%{family}\n')"
if [[ "$families" != *'Noto Sans CJK SC'* ]]; then
  echo 'Chinese browser fonts are unavailable; refusing to capture tofu screenshots.' >&2
  exit 1
fi
fc-match -f 'Chinese font fallback: %{family}\n' 'sans-serif:lang=zh-cn'
