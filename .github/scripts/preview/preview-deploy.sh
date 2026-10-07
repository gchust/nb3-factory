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
#
# Every wait is bounded. CI runs this inside its 45-minute Deploy step, and when
# that step times out only the ssh client dies: this script would carry on, and
# an unbounded wait would hold the deploy lock for whatever came next. The
# budget, in seconds, with the defaults:
#
#   fetch    600  PREVIEW_FETCH_BUDGET (preview-lib.sh), every try included
#   lock     960  PREVIEW_LOCK_WAIT
#   migrate  480  PREVIEW_MIGRATE_TIMEOUT
#   start    120  PREVIEW_START_TIMEOUT, creating the container
#   ready     90  the readiness probe
#   total = 2250 s, 37.5 minutes, plus up to three for unpacking, linking and
#   a rollback on local disk, inside the 45-minute step.
#
# The lock wait is at least the longest this script holds the lock (migrate,
# start and ready, 690 s, plus those three minutes), so a deploy queued behind
# another one, an orphaned one included, waits for it rather than failing.
# That covers an older deploy of the same pull request that already held the
# lock when this one started: it finishes, and this one then replaces it.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=preview-lib.sh
. "$script_dir/preview-lib.sh"
. "$script_dir/preview-transaction.sh"

pr=""
sha=""
deps_key=""
payload=""
payload_url=""
payload_sha256=""
fetch_proxy="${PREVIEW_FETCH_PROXY:-}"
build_status=""
redeploy=false

PREVIEW_LOCK_WAIT="${PREVIEW_LOCK_WAIT:-960}"
PREVIEW_MIGRATE_TIMEOUT="${PREVIEW_MIGRATE_TIMEOUT:-480}"
PREVIEW_START_TIMEOUT="${PREVIEW_START_TIMEOUT:-120}"

usage() {
  cat >&2 <<'USAGE'
Usage: preview-deploy.sh --pr <number> --sha <commit> --deps-key <key> \
         --payload <dist.tar.gz> [--payload-url <url> --payload-sha256 <digest>] \
         [--fetch-proxy <url>] [--domain <preview domain>] \
         [--build-status success|failed] [--redeploy]

With --payload-url the payload is fetched from that URL when it is missing or
fails its digest, so a failed transfer is retried by running this again rather
than re-sending the bytes from CI. --payload-sha256 is required with
--payload-url: a fetched payload is never deployed unverified.

An instance that already serves this commit with this dependency set is left
alone: one build can be requested twice — the task workflow dispatches this
deploy explicitly and GitHub also raises `workflow_run` for the same completed
run — and the second request would otherwise replace a preview someone may
already be using. --redeploy replaces it anyway.

--build-status records whether the task that produced this build was accepted.
A full host evicts previews of failed builds first (see preview-capacity.sh), so
an instance deployed without it is treated as unknown.
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
    --build-status) build_status="${2:-}"; shift 2 ;;
    --redeploy) redeploy=true; shift ;;
    --domain) PREVIEW_DOMAIN="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -n "$pr" && -n "$sha" && -n "$deps_key" && -n "$payload" ]] || usage
require_positive_integer "$pr"
[[ -z "$build_status" || "$build_status" == success || "$build_status" == failed ]] ||
  die "--build-status must be success or failed, got: $build_status"
[[ -z "$payload_url" || -n "$payload_sha256" ]] ||
  die "--payload-url requires --payload-sha256; a fetched payload is never deployed unverified"
[[ -n "$payload_url" || -f "$payload" ]] || die "payload not found: $payload"

require_command docker
require_command tar
require_command curl
require_command openssl
require_command flock
require_command timeout
[[ -z "$payload_sha256" ]] || require_command sha256sum

ensure_layout

# CI gives every deploy a payload path of its own, so nothing will ever read a
# payload this deploy fetched once it ends: it goes whatever the outcome, and a
# failed deploy is retried by a new run that fetches its own. A payload passed
# without a URL belongs to whoever put it there and is kept until success.
discard_payload() {
  [[ -z "$payload_url" ]] || rm -f "$payload" "$payload.part"
}
trap discard_payload EXIT

# Taken before the fetch, which runs outside the deploy lock: a teardown, or a
# newer deploy of this pull request, that starts while this deploy fetches or
# waits for the lock is newer than this.
started_ns="$(date +%s%N)"
mark_started "$pr" "$started_ns"

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
flock -w "$PREVIEW_LOCK_WAIT" 9 ||
  die "another preview operation held the deploy lock for ${PREVIEW_LOCK_WAIT}s; PR #$pr was not deployed. Re-run Deploy Task Preview for this task run once the host is free (see PREVIEWS.md, 手动补发)"

# A deploy whose CI step was cut off keeps running here; if its pull request
# was torn down meanwhile, deploying now would bring a closed preview back.
if closed_since "$pr" "$started_ns"; then
  rm -f "$payload" "$payload.part"
  die "PR #$pr was torn down after this deploy started; not recreating its preview"
fi
# Nor may it replace what a newer deploy of the pull request brought up, or is
# about to: that one serves a later build.
if superseded_since "$pr" "$started_ns"; then
  rm -f "$payload" "$payload.part"
  die "a newer deploy of PR #$pr started after this one; not replacing its build with an older one"
fi

# --- an instance that is already this build ---------------------------------
# The lock is what makes this answer trustworthy: a deploy in flight holds it
# while it writes the instance state, so what is read here is either a finished
# deploy or an unrelated one.
if [[ "$redeploy" == true ]]; then
  log "redeploy requested; replacing the running preview even though it may already serve this build"
elif instance_serves "$dir" "$name" "$sha" "$deps_key"; then
  log "PR #$pr already serves $sha with dependency set ${deps_key:0:12}; leaving the running preview as it is"
  rm -f "$payload"
  exit 0
fi

existing_count="$(list_instances | wc -l | tr -d ' ')"
if [[ ! -d "$dir" && "$existing_count" -ge "$PREVIEW_MAX_INSTANCES" ]]; then
  # CI checks this with preview-capacity.sh and makes room before it uploads a
  # payload, so reaching it means something else filled the host in between.
  die "already $existing_count previews (limit $PREVIEW_MAX_INSTANCES); run preview-destroy.sh <pr> for a preview nobody needs first"
fi

log "deploying PR #$pr ($sha) as $url"

staging="$(mktemp -d "$PREVIEW_TMP_DIR/pr-${pr}.XXXXXX")"
migrate_container="${name}-migrate"
transaction_started=false
cleanup() {
  status=$?
  trap - EXIT
  # A migration cut off by its timeout leaves its container behind: stopping
  # the docker client does not stop the container it started.
  remove_container "$migrate_container" || true
  if [[ "$transaction_started" == true ]]; then preview_rollback; fi
  rm -rf "$staging"
  discard_payload
  exit "$status"
}
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

# Snapshot disposable preview state before applying a newly verified build.
# Fresh initialization matches CI and tolerates changes to unmerged seeds.
mkdir -p "$PREVIEW_ROOT/backups"
preview_begin

# --- application files ------------------------------------------------------
# The built tree is replaced wholesale rather than by copying a list of known
# directories. A list falls behind what the build emits — an early version of
# this script omitted `dist/cli` and produced a preview that came up far enough
# to attempt a migration and then failed to find the migrator — and it would
# also let a file dropped from a later build survive from the previous one.
#
# preview_begin moved the previous instance — configuration, database, uploads
# and all — into the backup, so the instance directory starts empty here. This
# deployment initializes a new disposable dataset against the verified sources.
mkdir -p "$dir/dist"
# The dependency tree is linked in below; a cold payload already had it moved to
# the cache, and this is the guarantee that it is not copied a second time.
rm -rf "$staging/dist/node_modules"
cp -a "$staging/dist/." "$dir/dist/"

if [[ -f "$staging/config.example.yml" ]]; then
  cp -a "$staging/config.example.yml" "$dir/config.example.yml"
fi

# Hard links rather than a copy: the layout stays exactly what a real
# deployment has, at the cost of directory entries only (~30k of them). Every
# deploy links a fresh tree, because the instance directory is new; the
# previous one's tree went into the backup with it.
log "linking dependency tree $deps_key into the instance"
cp -al "$cache/node_modules" "$dir/dist/node_modules"

# --- configuration ----------------------------------------------------------
# Written on every deploy, with a new secret: the dataset is new as well, so
# no session from the previous instance could outlive the deploy anyway, and
# restarting the container keeps this file. Paths are container paths because
# the instance is mounted at /app.
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

# --- replace the running container -----------------------------------------
remove_container "$name"

# Migration and seeding run as their own container so a failure is a deploy
# failure in this log, rather than something the server hits at boot. Named,
# so a run its timeout cut off can be removed (see cleanup).
#
# no-new-privileges: nothing in the application needs a setuid binary to gain
# privileges. The containers still run as root with Docker's default
# capabilities: the instance tree is extracted as root and keeps the uid the
# CI runner recorded in the archive, so whether a non-root user, or root
# without CAP_DAC_OVERRIDE, could write what the application writes there has
# not been established.
run_app_once() {
  remove_container "$migrate_container"
  timeout --kill-after=15 "$PREVIEW_MIGRATE_TIMEOUT" docker run --rm \
    --name "$migrate_container" \
    --security-opt no-new-privileges \
    --cpus "$PREVIEW_CPU_LIMIT" \
    --memory "$PREVIEW_MEMORY_LIMIT" \
    --volume "$dir:$container_base" \
    --workdir "$container_base" \
    --env NODE_ENV=production \
    --env "APP_CONFIG_FILE=$container_base/config.yml" \
    --env "APP_BASE_PATH=$PREVIEW_BASE_PATH" \
    "$PREVIEW_RUNTIME_IMAGE" "$@"
}

# Apply the current CLI plan once; a failed migration must stop deployment.
log "applying migrations and seeds"
migrate_status=0
run_app_once node ./dist/cli/index.js db apply >"$PREVIEW_LOG_DIR/pr-${pr}-migrate.log" 2>&1 ||
  migrate_status=$?
if (( migrate_status != 0 )); then
  tail -n 40 "$PREVIEW_LOG_DIR/pr-${pr}-migrate.log" >&2
  # timeout exits 124 when it had to stop the command, 137 when it killed it.
  if (( migrate_status == 124 || migrate_status == 137 )); then
    die "migrations or seeds for PR #$pr did not finish within ${PREVIEW_MIGRATE_TIMEOUT}s"
  fi
  die "migrations or seeds failed for PR #$pr"
fi

log "starting $name"
timeout --kill-after=15 "$PREVIEW_START_TIMEOUT" docker run --detach \
  --name "$name" \
  --network "$PREVIEW_NETWORK" \
  --restart unless-stopped \
  --security-opt no-new-privileges \
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
buildStatus=${build_status:-unknown}
ENV

if ! wait_for_preview "$host" 90; then
  docker logs --tail 60 "$name" >&2 || true
  die "PR #$pr did not become ready at $url within 90s"
fi

preview_commit
rm -f "$(closed_mark "$pr")"
# The instance now holds everything it needs; the staged payload (about 84 MB
# packed) would otherwise stay on the host for every open pull request.
rm -f "$payload"
log "PR #$pr is live at $url"
