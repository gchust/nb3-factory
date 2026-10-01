// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { API_KEYS_PAGE_ACCESS } from '@nocobase/app-plugin-api-keys/client';

import clientPlugins from '../../client/plugins.js';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));

interface AppPackageJson {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

const appPackage = JSON.parse(
  readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
) as AppPackageJson;

const registeredClientPackages = clientPlugins.plugins.map(
  (plugin) => plugin.packageName,
);

describe('client plugin registry consistency', () => {
  it('declares every client plugin as a dependency', () => {
    const undeclared = registeredClientPackages.filter(
      (packageName) =>
        appPackage.devDependencies?.[packageName] === undefined &&
        appPackage.dependencies?.[packageName] === undefined,
    );

    expect(undeclared).toEqual([]);
  });

  it('mounts the standard user and API key pages under Settings', () => {
    for (const [packageName, routePath] of [
      ['@nocobase/app-plugin-users', '/users'],
      ['@nocobase/app-plugin-api-keys', '/api-keys'],
    ]) {
      const plugin = clientPlugins.plugins.find(
        (entry) => entry.packageName === packageName,
      );
      expect(plugin?.routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            parent: 'settings',
            routes: expect.arrayContaining([
              expect.objectContaining({ path: routePath }),
            ]),
          }),
        ]),
      );
    }
  });

  it('keeps the API key plugin identity while serving the application page', async () => {
    const resolved = resolveAppClientContributions(
      clientPlugins.plugins.map((plugin) => ({
        packageName: plugin.packageName,
        source: 'plugin' as const,
        routes: plugin.routes,
      })),
    );
    const apiKeys = findRoute(resolved.settingsRouteTree, 'api-keys');

    // The wrap replaces only the browser component; the plugin still owns the
    // Settings path, page grant and navigation entry.
    expect(apiKeys).toMatchObject({
      name: 'api-keys',
      path: '/settings/api-keys',
      authz: API_KEYS_PAGE_ACCESS,
      packageName: '@nocobase/app-plugin-api-keys',
    });
    expect(apiKeys?.navigation?.title).toBeTruthy();
    expect(apiKeys?.componentLoader).toBeTypeOf('function');

    const loaded = await apiKeys?.componentLoader?.();
    const applicationPage =
      await import('../../client/pages/service/api-keys/index.js');
    expect(loaded?.default).toBe(applicationPage.default);
  });

  it('registers no package twice', () => {
    expect(new Set(registeredClientPackages).size).toBe(
      registeredClientPackages.length,
    );
  });
});

function findRoute(
  routes: readonly AppClientRegisteredRoute[],
  name: string,
): AppClientRegisteredRoute | undefined {
  for (const route of routes) {
    if (route.name === name) return route;
    const nested = findRoute(route.children ?? [], name);
    if (nested) return nested;
  }
  return undefined;
}
