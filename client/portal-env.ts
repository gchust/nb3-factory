import { readAppClientRuntimeConfig } from '@nocobase/app-client/runtime';

/**
 * Compatibility bridge for the deprecated `@nocobase/app-portal-sdk`.
 *
 * The AI Knowledge Base plugin still builds its client on that package, whose
 * HTTP client resolves its API URL once, at module load, from
 * `window.NOCOBASE_API_URL` (falling back to the hard-coded
 * `http://127.0.0.1:13000/api`). A v3 application publishes neither that global
 * nor a Vite environment value: the server renders the mount path and API base
 * into the `#nocobase-runtime-config` JSON block instead. Without this bridge a
 * deployment mounted anywhere other than the default origin root sends the
 * knowledge-base requests to the wrong URL and every call 404s.
 *
 * The values are read from the same block the first-party client uses, so they
 * stay correct under any `APP_BASE_PATH`. This module is imported first in
 * `client/index.tsx`, before anything that pulls in the portal SDK, so the
 * globals are in place before that package's module body runs. It can be
 * removed once the knowledge-base plugin stops depending on the portal SDK.
 */

declare global {
  interface Window {
    NOCOBASE_API_URL?: string;
    APP_BASE_PATH?: string;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function installPortalCompatibilityGlobals(): void {
  if (typeof window === 'undefined') return;

  let config: unknown;
  try {
    config = readAppClientRuntimeConfig();
  } catch {
    // A page not served by the application server carries no runtime config;
    // there is nothing to bridge and the portal SDK keeps its own fallback.
    return;
  }

  const root = asRecord(config);
  if (!root) return;
  const app = asRecord(root.app);
  const api = asRecord(root.api);

  const basePath = typeof app?.basePath === 'string' ? app.basePath : undefined;
  const apiURL = typeof api?.baseURL === 'string' ? api.baseURL : undefined;

  if (basePath && !window.APP_BASE_PATH) window.APP_BASE_PATH = basePath;
  if (apiURL && !window.NOCOBASE_API_URL) window.NOCOBASE_API_URL = apiURL;
}

installPortalCompatibilityGlobals();
