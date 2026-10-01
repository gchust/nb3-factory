/**
 * Republish the application's mount path to the v2 Portal runtime.
 *
 * The AI Knowledge Base plugin's client talks to the server through
 * `@nocobase/app-portal-sdk`'s `nocobaseClient`, a v2-era HTTP client. It reads
 * its API base URL once, when its module is first evaluated, from
 * `window.NOCOBASE_API_URL` and falls back to `http://127.0.0.1:13000/api`.
 * `@nocobase/app-client` instead reads the runtime configuration the server
 * renders into the page (`#nocobase-runtime-config`), so every other page
 * already uses the real mount path. Under `/main` the two disagree and the
 * plugin's Settings pages request `/api/...` instead of `/main/api/...` and
 * 404.
 *
 * This module runs as the first import of the client entry, before any plugin
 * (and therefore before the Portal SDK) is loaded, and derives the same URL
 * from the configuration the server already published. Values set explicitly
 * by an integrator are left untouched, and a page that was not served by the
 * application server keeps its own configuration.
 */
import { resolveAppBase, resolveAppUrl } from '@nocobase/app-client';

function publishRuntimeCompatibility(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    // Both throw when the page carries no server-rendered `app.basePath`.
    const basePath = resolveAppBase();
    const apiUrl = resolveAppUrl('/api');
    if (!window.APP_BASE_PATH) {
      window.APP_BASE_PATH = basePath;
    }
    if (!window.NOCOBASE_API_URL) {
      window.NOCOBASE_API_URL = apiUrl;
    }
  } catch {
    // Not served by this application's server: leave the page's own
    // configuration, if any, in charge.
  }
}

publishRuntimeCompatibility();
