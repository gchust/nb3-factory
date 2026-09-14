#!/usr/bin/env bash
# One-time (and safely repeatable) setup of the preview host.
#
# Creates the directory layout and Docker network, builds the Node runtime
# image, and brings up Traefik. Run this before the first preview deploy, and
# again after changing the Dockerfile or the Traefik compose file.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=preview-lib.sh
. "$script_dir/preview-lib.sh"

require_command docker
require_command curl
require_command flock

log "preparing $PREVIEW_ROOT"
ensure_layout

if network_exists; then
  log "docker network $PREVIEW_NETWORK already exists"
else
  log "creating docker network $PREVIEW_NETWORK"
  docker network create "$PREVIEW_NETWORK" >/dev/null
fi

# The base image is pulled before the build rather than by it. This host reaches
# the registry through an HTTP proxy configured on the Docker daemon, and the
# build's own metadata lookup does not go through that proxy — it resolves the
# registry directly, tries IPv6, and times out. Pulling first leaves the image in
# the local store, so the build needs no registry access at all.
log "pulling base image $PREVIEW_NODE_IMAGE"
docker pull "$PREVIEW_NODE_IMAGE" >/dev/null ||
  die "could not pull $PREVIEW_NODE_IMAGE; check the registry proxy configuration"

log "building runtime image $PREVIEW_RUNTIME_IMAGE"
build_args=(--build-arg "NODE_IMAGE=$PREVIEW_NODE_IMAGE")
if [[ -n "$PREVIEW_BUILD_PROXY" ]]; then
  # A build step's network access sees only what the build client passes, so a
  # host without direct egress must supply its proxy here.
  build_args+=(
    --build-arg "HTTP_PROXY=$PREVIEW_BUILD_PROXY"
    --build-arg "HTTPS_PROXY=$PREVIEW_BUILD_PROXY"
    --build-arg "NO_PROXY=localhost,127.0.0.1,::1"
  )
fi
docker build \
  --tag "$PREVIEW_RUNTIME_IMAGE" \
  --file "$script_dir/runtime/Dockerfile" \
  "${build_args[@]}" \
  "$script_dir/runtime"

log "starting Traefik on 127.0.0.1:$PREVIEW_TRAEFIK_PORT"
docker compose \
  --file "$script_dir/traefik/docker-compose.yml" \
  up --detach --remove-orphans

# Any HTTP status proves Traefik is serving; with no routes defined yet a 404 is
# the expected answer.
for _ in $(seq 1 30); do
  if curl --silent --output /dev/null --max-time 2 \
    "http://127.0.0.1:${PREVIEW_TRAEFIK_PORT}/"; then
    log "preview host ready"
    exit 0
  fi
  sleep 1
done

docker logs --tail 40 nb3-preview-traefik >&2 || true
die "Traefik did not start on 127.0.0.1:$PREVIEW_TRAEFIK_PORT"
