/**
 * Bridges the application's runtime base path to the legacy Portal SDK globals.
 *
 * `@nocobase/app-portal-sdk` reads `window.NOCOBASE_API_URL` and
 * `window.APP_BASE_PATH` once, when its modules first evaluate, and the
 * installed AI Knowledge Base and AI Employee client packages import it before
 * any component renders. The application itself resolves its base path from the
 * `<script id="nocobase-runtime-config">` element instead, so without this
 * bridge those packages build same-origin URLs that omit the deployment base
 * path (for example `/api/ai/...` instead of `/main/api/ai/...`) and every
 * request 404s.
 *
 * Import this module before the application runtime so the globals exist before
 * the deprecated SDK is evaluated. It only sets the two window properties the
 * SDK already expects; nothing else is exposed.
 */
interface RuntimeConfigScript {
  readonly config?: {
    readonly app?: { readonly basePath?: string };
    readonly api?: { readonly baseURL?: string };
  };
}

function readRuntimeConfig(): RuntimeConfigScript | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const element = document.getElementById('nocobase-runtime-config');
  if (!element?.textContent) {
    return undefined;
  }
  try {
    return JSON.parse(element.textContent) as RuntimeConfigScript;
  } catch {
    return undefined;
  }
}

function deriveBasePath(): string {
  const configured = readRuntimeConfig()?.config?.app?.basePath;
  if (configured) {
    return configured;
  }
  // Fall back to the directory the compiled entry module is served from.
  const entry = Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'),
  ).find((node) => /\/assets\//.test(node.src));
  if (entry) {
    const match = new URL(entry.src, window.location.origin).pathname.match(
      /^(.*?)\/assets\//,
    );
    if (match?.[1]) {
      return match[1];
    }
  }
  return '';
}

export function applyPortalRuntimeGlobals(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const config = readRuntimeConfig();
  const basePath = config?.config?.app?.basePath ?? deriveBasePath();
  const apiUrl =
    config?.config?.api?.baseURL ??
    (basePath ? `${basePath}/api` : '/api');
  const target = window as unknown as Record<string, string>;
  if (basePath) {
    target.APP_BASE_PATH = basePath;
  }
  target.NOCOBASE_API_URL = apiUrl;
}

applyPortalRuntimeGlobals();
