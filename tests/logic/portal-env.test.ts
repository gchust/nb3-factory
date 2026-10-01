import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installPortalCompatibilityGlobals } from '../../client/portal-env.js';

// The AI Knowledge Base client still builds on the deprecated
// `@nocobase/app-portal-sdk`, which reads its API URL from
// `window.NOCOBASE_API_URL` once, at module load. This bridge copies the server
// runtime config into that global so a deployment mounted under a base path
// does not send knowledge-base requests to the default origin root.

const ELEMENT_ID = 'nocobase-runtime-config';

function clearRuntimeConfig(): void {
  document.getElementById(ELEMENT_ID)?.remove();
}

function publishRuntimeConfig(config: unknown, version = 1): void {
  const element = document.createElement('script');
  element.id = ELEMENT_ID;
  element.type = 'application/json';
  element.textContent = JSON.stringify({ version, config });
  document.head.append(element);
}

beforeEach(clearRuntimeConfig);

afterEach(() => {
  clearRuntimeConfig();
  delete window.NOCOBASE_API_URL;
  delete window.APP_BASE_PATH;
});

describe('portal SDK compatibility globals', () => {
  it('copies the mount path and API base from the runtime config block', () => {
    publishRuntimeConfig({
      app: { basePath: '/main' },
      api: { baseURL: '/main/api' },
    });

    installPortalCompatibilityGlobals();

    expect(window.APP_BASE_PATH).toBe('/main');
    expect(window.NOCOBASE_API_URL).toBe('/main/api');
  });

  it('does not overwrite values a host already set', () => {
    publishRuntimeConfig({ api: { baseURL: '/main/api' } });
    window.NOCOBASE_API_URL = 'https://example.test/api';

    installPortalCompatibilityGlobals();

    expect(window.NOCOBASE_API_URL).toBe('https://example.test/api');
  });

  it('leaves the globals unset when the page carries no runtime config', () => {
    installPortalCompatibilityGlobals();

    expect(window.NOCOBASE_API_URL).toBeUndefined();
    expect(window.APP_BASE_PATH).toBeUndefined();
  });
});
