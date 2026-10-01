import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The v2 Portal runtime reads its API base URL from the window once, at module
 * evaluation. The entry's first import must publish the mount path from the
 * server-rendered client configuration before any plugin can load it.
 */
const RUNTIME_CONFIG_ELEMENT_ID = 'nocobase-runtime-config';

function writeConfig(basePath: string | undefined): void {
  document.getElementById(RUNTIME_CONFIG_ELEMENT_ID)?.remove();
  if (basePath === undefined) return;
  const element = document.createElement('script');
  element.id = RUNTIME_CONFIG_ELEMENT_ID;
  element.type = 'application/json';
  element.textContent = JSON.stringify({
    version: 1,
    config: { app: { basePath }, api: { baseURL: `${basePath}/api` } },
  });
  document.head.append(element);
}

async function runCompat(): Promise<void> {
  vi.resetModules();
  await import('../../client/api-base-compat.js');
}

describe('portal API base compatibility shim', () => {
  beforeEach(() => {
    delete window.APP_BASE_PATH;
    delete window.NOCOBASE_API_URL;
  });

  afterEach(() => {
    delete window.APP_BASE_PATH;
    delete window.NOCOBASE_API_URL;
  });

  it('publishes the mount path and API URL from the server configuration', async () => {
    writeConfig('/main');
    await runCompat();
    expect(window.APP_BASE_PATH).toBe('/main/');
    expect(window.NOCOBASE_API_URL).toBe('/main/api');
  });

  it('leaves values an integrator set explicitly untouched', async () => {
    writeConfig('/main');
    window.NOCOBASE_API_URL = 'https://backend.example.com/main/api';
    await runCompat();
    expect(window.NOCOBASE_API_URL).toBe(
      'https://backend.example.com/main/api',
    );
    expect(window.APP_BASE_PATH).toBe('/main/');
  });

  it('does nothing when the page carries no server configuration', async () => {
    writeConfig(undefined);
    await runCompat();
    expect(window.APP_BASE_PATH).toBeUndefined();
    expect(window.NOCOBASE_API_URL).toBeUndefined();
    // Restore what the shared client setup renders for the remaining tests.
    writeConfig('/main');
  });
});
