#!/usr/bin/env bash
# Shared constants and helpers for the PR preview environment on the preview host.
#
# The preview host runs one Docker container per pull request behind a Traefik
# instance. Nothing here builds an application: the deployable artifact is
# produced by CI (`pnpm build --tar`) and pushed in, so a preview is always the
# exact tree that `verify.sh` accepted.
set -euo pipefail

PREVIEW_ROOT="${PREVIEW_ROOT:-/srv/nb3-preview}"
PREVIEW_DEPS_DIR="$PREVIEW_ROOT/deps"
PREVIEW_INSTANCES_DIR="$PREVIEW_ROOT/instances"
PREVIEW_TMP_DIR="$PREVIEW_ROOT/tmp"
PREVIEW_LOG_DIR="$PREVIEW_ROOT/logs"

PREVIEW_NETWORK="${PREVIEW_NETWORK:-nb3-preview}"
PREVIEW_RUNTIME_IMAGE="${PREVIEW_RUNTIME_IMAGE:-nb3-preview-runtime}"
PREVIEW_TRAEFIK_PORT="${PREVIEW_TRAEFIK_PORT:-8081}"

# Base image for the runtime. It must supply the Node ABI that CI recorded in
# `dist/package.json` under `nocobase.buildTarget` (Node 24 is ABI 137), and a
# glibc at least as new as whatever the shipped native prebuilds were built
# against. `better-sqlite3` is fetched as a `linux-x64` glibc prebuild, so a
# glibc base is required and a musl one would not run at all.
PREVIEW_NODE_IMAGE="${PREVIEW_NODE_IMAGE:-node:24-trixie-slim}"

# Optional HTTP proxy for building the runtime image. The Docker daemon's own
# proxy setting covers pulling, but a build step's network access only sees what
# the build client passes, so installing a package inside the image needs this
# set explicitly on a network that has no direct egress.
PREVIEW_BUILD_PROXY="${PREVIEW_BUILD_PROXY:-}"

# Optional HTTP proxy for fetching a payload. The same network that has no direct
# egress for a build also has none for `curl`, so a host that needs the one needs
# the other. Used by preview-deploy.sh.
PREVIEW_FETCH_PROXY="${PREVIEW_FETCH_PROXY:-}"

# The application listens inside its container; the port is never published on
# the host, so previews cannot collide with the services already running here.
PREVIEW_APP_PORT="${PREVIEW_APP_PORT:-13000}"

# Kept identical to the base path `verify.sh` uses. A preview that served a
# different base path would not be the thing that was verified.
PREVIEW_BASE_PATH="${PREVIEW_BASE_PATH:-/main}"

PREVIEW_DOMAIN="${PREVIEW_DOMAIN:-nfvd.net}"

# A single vCPU is shared with Gitea, act_runner, four PostgreSQL instances and
# the NocoBase alpha container, so every preview is capped and their number is
# bounded.
PREVIEW_CPU_LIMIT="${PREVIEW_CPU_LIMIT:-0.5}"
PREVIEW_MEMORY_LIMIT="${PREVIEW_MEMORY_LIMIT:-768m}"
PREVIEW_MAX_INSTANCES="${PREVIEW_MAX_INSTANCES:-12}"

log() {
  printf '[preview] %s\n' "$*" >&2
}

die() {
  printf '[preview] error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

require_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]] || die "expected a positive integer, got: $1"
}

# Puts a payload in place, fetching it when needed and checking its digest either
# way. Usage: fetch_payload <path> <url> <sha256> <proxy>
#
# The bytes land in `<path>.part` and are moved into place only after the digest
# matches, so a truncated or tampered download can never be deployed as if it
# were complete. A failed attempt leaves that partial file behind, which is why
# nothing else reads that name.
fetch_payload() {
  local payload="$1" url="$2" expected="$3" proxy="$4"
  local actual partial
  if [[ -f "$payload" ]]; then
    if [[ -z "$expected" ]]; then
      log "using the payload already on this host: $payload"
      return 0
    fi
    actual="$(sha256sum "$payload" | cut -d' ' -f1)"
    if [[ "$actual" == "$expected" ]]; then
      log "payload already present and verified: $payload"
      return 0
    fi
    [[ -n "$url" ]] ||
      die "payload digest mismatch and no URL to refetch it: $payload"
    log "payload on this host does not match the digest; refetching"
    rm -f "$payload"
  fi

  [[ -n "$url" ]] || die "payload not found: $payload"
  [[ -n "$expected" ]] ||
    die "fetching a payload requires its digest; refusing to deploy unverified bytes"
  partial="$payload.part"
  rm -f "$partial"
  local -a curl_opts=(-fL --retry 3 --retry-delay 5 --connect-timeout 20)
  [[ -z "$proxy" ]] || curl_opts+=(-x "$proxy")
  log "fetching the payload from $url"
  curl "${curl_opts[@]}" -o "$partial" "$url" ||
    die "could not fetch the payload; set PREVIEW_FETCH_PROXY if this host needs a proxy for egress"
  actual="$(sha256sum "$partial" | cut -d' ' -f1)"
  if [[ "$actual" != "$expected" ]]; then
    rm -f "$partial"
    die "payload digest mismatch: expected $expected, got $actual"
  fi
  mv -f "$partial" "$payload"
  log "payload fetched and verified: $payload"
}

container_name() {
  printf 'preview-pr-%s' "$1"
}

router_name() {
  printf 'pr%s' "$1"
}

instance_dir() {
  printf '%s/pr-%s' "$PREVIEW_INSTANCES_DIR" "$1"
}

# Where one pull request's payload is staged while it is fetched and deployed.
payload_path() {
  printf '%s/payload-pr-%s.tar.gz' "$PREVIEW_TMP_DIR" "$1"
}

preview_host() {
  printf 'nb3-%s.%s' "$1" "$PREVIEW_DOMAIN"
}

preview_url() {
  printf 'https://%s%s/' "$(preview_host "$1")" "$PREVIEW_BASE_PATH"
}

deps_dir() {
  printf '%s/%s' "$PREVIEW_DEPS_DIR" "$1"
}

ensure_layout() {
  mkdir -p \
    "$PREVIEW_DEPS_DIR" \
    "$PREVIEW_INSTANCES_DIR" \
    "$PREVIEW_TMP_DIR" \
    "$PREVIEW_LOG_DIR"
}

network_exists() {
  docker network inspect "$PREVIEW_NETWORK" >/dev/null 2>&1
}

require_network() {
  network_exists ||
    die "docker network $PREVIEW_NETWORK is missing; run provision.sh first"
}

container_exists() {
  docker container inspect "$1" >/dev/null 2>&1
}

remove_container() {
  local name="$1"
  if container_exists "$name"; then
    docker rm --force "$name" >/dev/null
  fi
}

# Reads a single KEY=value pair out of an instance's preview.env.
read_instance_env() {
  local dir="$1" key="$2"
  local file="$dir/preview.env"
  [[ -f "$file" ]] || return 1
  sed -n "s/^${key}=//p" "$file" | head -n 1
}

# Loads preview.env into the current shell when it exists.
load_instance_env() {
  local dir="$1"
  local file="$dir/preview.env"
  [[ -f "$file" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  . "$file"
  set +a
}

# Polls the preview through Traefik, addressed by Host header, until the SPA
# answers. Traefik is the component that has to have discovered the container,
# so probing through it tests the whole path a visitor will take.
wait_for_preview() {
  local host="$1" timeout="${2:-90}"
  local url="http://127.0.0.1:${PREVIEW_TRAEFIK_PORT}${PREVIEW_BASE_PATH}/"
  local spent=0 code

  while ((spent < timeout)); do
    code="$(curl --silent --output /dev/null --write-out '%{http_code}' \
      --header "Host: ${host}" --max-time 5 "$url" || true)"
    if [[ "$code" =~ ^[23] ]]; then
      return 0
    fi
    sleep 1
    spent=$((spent + 1))
  done

  return 1
}

# Lists preview instances, newest first, by the deployedAt recorded in each
# preview.env. Instances without a readable timestamp sort last.
list_instances() {
  local dir
  for dir in "$PREVIEW_INSTANCES_DIR"/pr-*; do
    [[ -d "$dir" ]] || continue
    local pr deployed
    pr="$(basename "$dir")"
    deployed="$(read_instance_env "$dir" deployedAt || true)"
    printf '%s\t%s\n' "${deployed:-0000-00-00T00:00:00Z}" "${pr#pr-}"
  done | sort -r
}
