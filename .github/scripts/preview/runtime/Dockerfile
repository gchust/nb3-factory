# Runtime image for preview containers.
#
# Previews do not build anything: the application tree arrives already compiled
# and already carrying its own `node_modules`, so this image only has to supply
# a Node runtime that matches the build target CI recorded.
#
# The application needs Node 24 (`package.json` requires `>=24`), which is ABI
# 137 — the same ABI `pnpm build --target linux-x64` fetches native modules for.
# Override NODE_IMAGE when the recorded build target says otherwise, or if the
# shipped better-sqlite3 prebuild needs a newer glibc than the default provides.
ARG NODE_IMAGE=node:24-trixie-slim
FROM ${NODE_IMAGE}

# `node:*-slim` carries no CA bundle. Without one, any outbound TLS from the
# application fails, and the preview would differ from a real deployment in a
# way that is easy to mistake for an application bug.
#
# The proxy arguments are declared so the package manager can reach a mirror on
# a network that needs one. Build arguments are not persisted into the image, so
# declaring them here does not bake a proxy into the runtime.
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Overridden per deploy by the CLI for migrations and seeding.
CMD ["node", "./dist/server/standalone.js"]
