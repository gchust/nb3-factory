/**
 * Bridges the v3 runtime API base to the one client still reading the legacy
 * global.
 *
 * The AI knowledge-base plugin's client maps its knowledge-base, document and
 * vector actions through the deprecated `@nocobase/app-portal-sdk` v2 client.
 * That client resolves its API base once, when its module is evaluated, from
 * `window.NOCOBASE_API_URL`, and otherwise falls back to
 * `http://127.0.0.1:13000/api`. The v3 runtime deliberately puts nothing on
 * `window`: the mount path and API base are published in the
 * `nocobase-runtime-config` block instead, which `@nocobase/app-client` reads.
 * The two disagree under a mount path such as `/main`, so the plugin's settings
 * page requested `/api/ai/...` and answered 404 while every v3 request went to
 * `/main/api/ai/...`.
 *
 * Mirroring the block's `api.baseURL` onto the variable the legacy client reads
 * — before the plugin's module is evaluated, which is why this is the first
 * import of the client entry — points it at the same API as the rest of the
 * application. Remove this module once the plugin uses `@nocobase/app-client`.
 */
function publishLegacyApiUrl(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const element = document.getElementById('nocobase-runtime-config');
  if (!element?.textContent) return;
  try {
    const payload: unknown = JSON.parse(element.textContent);
    const baseURL = (
      payload as { config?: { api?: { baseURL?: unknown } } } | null
    )?.config?.api?.baseURL;
    if (typeof baseURL === 'string' && baseURL.trim()) {
      (window as { NOCOBASE_API_URL?: string }).NOCOBASE_API_URL =
        baseURL.trim();
    }
  } catch {
    // A malformed block is reported by the client runtime itself; the legacy
    // client keeps its built-in default rather than taking the page down here.
  }
}

publishLegacyApiUrl();
