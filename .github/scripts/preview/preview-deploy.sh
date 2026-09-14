#!/usr/bin/env bash
# Deploys one pull request as a live preview container on the preview host.
#
# Invoked over SSH by the deploy-preview workflow with an already-built
# `dist.tar.gz` produced by `pnpm build --tar`. Nothing is compiled here: this
# script only fetches, extracts, wires up dependencies, migrates, and starts.
#
# The payload is fetched by this host, not pushed to it. Pushing it over
# Tailscale measured 17 KB/s from a GitHub runner; the same file fetched from
# the temporary release asset over this host's own egress measured 815 KB/s. The
# SSH channel therefore carries a URL and a digest, and the bytes come in over
# the network the host already has. `--fetch-proxy` is that egress.
#
# The dependency tree is the expensive part of the artifact (roughly 740 MB of
# a 744 MB `dist/`), so it is cached per dependency set and reused by hard link.
# CI asks whether the cache holds a set before it sends one, which is what keeps
# an ordinary redeploy down to a few megabytes.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=preview-lib.sh
. "$script_dir/preview-lib.sh"

pr=""
sha=""
deps_key=""
payload=""
payload_url=""
payload_sha256=""
fetch_proxy="${PREVIEW_FETCH_PROXY:-}"

usage() {
  cat >&2 <<'USAGE'
Usage: preview-deploy.sh --pr <number> --sha <commit> --deps-key <key> \
         --payload <dist.tar.gz> [--payload-url <url> --payload-sha256 <digest>] \
         [--fetch-proxy <url>] [--domain <preview domain>]

With --payload-url the payload is fetched from that URL when it is missing or
fails its digest, so a failed transfer is retried by running this again rather
than re-sending the bytes from CI. --payload-sha256 is required with
--payload-url: a fetched payload is never deployed unverified.
USAGE
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) pr="${2:-}"; shift 2 ;;
    --sha) sha="${2:-}"; shift 2 ;;
    --deps-key) deps_key="${2:-}"; shift 2 ;;
    --payload) payload="${2:-}"; shift 2 ;;
    --payload-url) payload_url="${2:-}"; shift 2 ;;
    --payload-sha256) payload_sha256="${2:-}"; shift 2 ;;
    --fetch-proxy) fetch_proxy="${2:-}"; shift 2 ;;
    --domain) PREVIEW_DOMAIN="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -n "$pr" && -n "$sha" && -n "$deps_key" && -n "$payload" ]] || usage
require_positive_integer "$pr"
[[ -z "$payload_url" || -n "$payload_sha256" ]] ||
  die "--payload-url requires --payload-sha256; a fetched payload is never deployed unverified"
[[ -n "$payload_url" || -f "$payload" ]] || die "payload not found: $payload"

require_command docker
require_command tar
require_command curl
require_command openssl
require_command flock
[[ -z "$payload_sha256" ]] || require_command sha256sum

ensure_layout

fetch_payload "$payload" "$payload_url" "$payload_sha256" "$fetch_proxy"

require_network

name="$(container_name "$pr")"
dir="$(instance_dir "$pr")"
host="$(preview_host "$pr")"
url="$(preview_url "$pr")"
router="$(router_name "$pr")"
cache="$(deps_dir "$deps_key")"
container_base="/app"

# One deploy at a time. Two tasks finishing together would otherwise race to
# populate the same dependency cache and to read each other's instance state.
exec 9>"$PREVIEW_ROOT/deploy.lock"
flock 9

existing_count="$(list_instances | wc -l | tr -d ' ')"
if [[ ! -d "$dir" && "$existing_count" -ge "$PREVIEW_MAX_INSTANCES" ]]; then
  die "already $existing_count previews (limit $PREVIEW_MAX_INSTANCES); run preview-gc.sh or preview-destroy.sh <pr> first"
fi

log "deploying PR #$pr ($sha) as $url"

staging="$(mktemp -d "$PREVIEW_TMP_DIR/pr-${pr}.XXXXXX")"
cleanup() { rm -rf "$staging"; }
trap cleanup EXIT

tar -xzf "$payload" -C "$staging"
[[ -f "$staging/dist/server/standalone.js" ]] ||
  die "payload does not contain dist/server/standalone.js; refusing to deploy"
[[ -f "$staging/dist/package.json" ]] ||
  die "payload does not contain dist/package.json; refusing to deploy"

# --- dependency cache -------------------------------------------------------
# A payload that carries node_modules is the cold-cache case; the tree becomes
# the cache entry, so later deploys for the same dependency set are slim.
if [[ -d "$staging/dist/node_modules" ]]; then
  if [[ -d "$cache/node_modules" ]]; then
    log "dependency cache $deps_key already present; discarding shipped tree"
    rm -rf "$staging/dist/node_modules"
  else
    log "populating dependency cache $deps_key"
    mkdir -p "$cache"
    mv "$staging/dist/node_modules" "$cache/node_modules"
  fi
fi

[[ -d "$cache/node_modules" ]] ||
  die "dependency cache $deps_key is missing and the payload carried none; send a full build"

# --- application files ------------------------------------------------------
# The built tree is replaced wholesale rather than by copying a list of known
# directories. A list falls behind what the build emits — an early version of
# this script omitted `dist/cli` and produced a preview that came up far enough
# to attempt a migration and then failed to find the migrator — and it would
# also let a file dropped from a later build survive from the previous one.
#
# Configuration, database, uploaded files and the dependency tree are what
# outlive a redeploy, so a preview keeps its data.
mkdir -p "$dir/dist"
find "$dir/dist" -mindepth 1 -maxdepth 1 \
  ! -name node_modules ! -name storage -exec rm -rf {} +
# The dependency tree is linked in below; a cold payload already had it moved to
# the cache, and this is the guarantee that it is not copied a second time.
rm -rf "$staging/dist/node_modules"
cp -a "$staging/dist/." "$dir/dist/"

if [[ -f "$staging/config.example.yml" && ! -f "$dir/config.example.yml" ]]; then
  cp -a "$staging/config.example.yml" "$dir/config.example.yml"
fi

# Relinking 740 MB of dependencies on every deploy would dominate the run, so
# it is skipped when the instance already holds this exact dependency set.
recorded_key="$(read_instance_env "$dir" depsKey || true)"
if [[ "$recorded_key" == "$deps_key" && -d "$dir/dist/node_modules" ]]; then
  log "dependency set unchanged; keeping the existing tree"
else
  log "linking dependency tree $deps_key into the instance"
  rm -rf "$dir/dist/node_modules"
  # Hard links rather than a copy: the layout stays exactly what a real
  # deployment has, at the cost of directory entries only.
  cp -al "$cache/node_modules" "$dir/dist/node_modules"
  # Recorded now rather than only on success, so retrying after a later failure
  # does not relink the tree every time.
  cat >"$dir/preview.env" <<ENV
pr=$pr
sha=$sha
depsKey=$deps_key
ENV
fi

# --- configuration ----------------------------------------------------------
# Generated once and kept, so restarting a preview does not invalidate every
# session. Paths are container paths because the instance is mounted at /app.
if [[ ! -f "$dir/config.yml" ]]; then
  log "writing config.yml"
  secret="$(openssl rand -hex 32)"
  mkdir -p "$dir/data/storage/private" "$dir/data/storage/public" "$dir/data/storage/links"
  cat >"$dir/config.yml" <<YAML
auth:
  secret: "${secret}"
  emailAndPassword:
    enabled: true
    autoSignIn: false
  session:
    storeSessionInDatabase: true
session:
  secret: "${secret}"
database:
  default: main
  connections:
    main:
      dialect: sqlite
      database: "${container_base}/data/database.sqlite"
  migrations:
    autoRun: false
  seeds:
    autoRun: false
snowflake:
  workerId: 0
  epoch: 1605024000
drive:
  default: local
  disks:
    local:
      driver: fs
      location: "${container_base}/data/storage/private"
      visibility: private
    public:
      driver: fs
      location: "${container_base}/data/storage/public"
      visibility: public
      url: /storage
  links:
    "${container_base}/data/storage/links/public": "${container_base}/data/storage/public"
YAML
fi

# --- replace the running container -----------------------------------------
remove_container "$name"

# Migration and seeding run as their own container so a failure is a deploy
# failure in this log, rather than something the server hits at boot.
run_app_once() {
  docker run --rm \
    --cpus "$PREVIEW_CPU_LIMIT" \
    --memory "$PREVIEW_MEMORY_LIMIT" \
    --volume "$dir:$container_base" \
    --workdir "$container_base" \
    --env NODE_ENV=production \
    --env "APP_CONFIG_FILE=$container_base/config.yml" \
    --env "APP_BASE_PATH=$PREVIEW_BASE_PATH" \
    "$PREVIEW_RUNTIME_IMAGE" "$@"
}

log "running migrations"
run_app_once node ./dist/cli/index.js app migrate >"$PREVIEW_LOG_DIR/pr-${pr}-migrate.log" 2>&1 ||
  { tail -n 40 "$PREVIEW_LOG_DIR/pr-${pr}-migrate.log" >&2; die "migrations failed for PR #$pr"; }

log "running seeds"
run_app_once node ./dist/cli/index.js app seed >"$PREVIEW_LOG_DIR/pr-${pr}-seed.log" 2>&1 ||
  { tail -n 40 "$PREVIEW_LOG_DIR/pr-${pr}-seed.log" >&2; die "seeds failed for PR #$pr"; }

log "starting $name"
docker run --detach \
  --name "$name" \
  --network "$PREVIEW_NETWORK" \
  --restart unless-stopped \
  --cpus "$PREVIEW_CPU_LIMIT" \
  --memory "$PREVIEW_MEMORY_LIMIT" \
  --volume "$dir:$container_base" \
  --label traefik.enable=true \
  --label "traefik.http.routers.${router}.rule=Host(\`${host}\`)" \
  --label "traefik.http.routers.${router}.entrypoints=web" \
  --label "traefik.http.services.${router}.loadbalancer.server.port=${PREVIEW_APP_PORT}" \
  --env APP_SERVER_HOST=0.0.0.0 \
  --env "APP_SERVER_PORT=$PREVIEW_APP_PORT" \
  --env "APP_PUBLIC_ORIGIN=https://${host}" \
  --env "APP_BASE_PATH=$PREVIEW_BASE_PATH" \
  --env "APP_CONFIG_FILE=$container_base/config.yml" \
  --env NODE_ENV=production \
  "$PREVIEW_RUNTIME_IMAGE" >/dev/null

deployed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat >"$dir/preview.env" <<ENV
pr=$pr
sha=$sha
depsKey=$deps_key
deployedAt=$deployed_at
host=$host
url=$url
container=$name
ENV

if ! wait_for_preview "$host" 90; then
  docker logs --tail 60 "$name" >&2 || true
  die "PR #$pr did not become ready at $url within 90s"
fi

log "PR #$pr is live at $url"
