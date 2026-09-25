// @vitest-environment node

import {
  defineClientPlugin,
  defineClientPlugins,
  defineDevRoutes,
  defineSettingsRoutes,
  resolveAppClientContributions,
  type AppClientDevRouteDefinition,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import { withLegacyPluginDevAuthz } from '../../client/plugin-dev-authz.js';
import clientPlugins from '../../client/plugins.js';

const packageName = '@nocobase/app-plugin-ai-knowledge-base';
const grant = {
  resource: { type: 'page', id: 'ai.settings' },
  action: 'access',
};

// Published beta.9 JavaScript predates the now-required TypeScript authz field.
function legacyPage(name: string): AppClientDevRouteDefinition {
  return {
    name,
    path: '/' + name,
    componentLoader: async () => ({ default: () => null }),
  } as AppClientDevRouteDefinition;
}

function resolve(plugins: AppClientPlugins) {
  return resolveAppClientContributions(
    plugins.plugins.map((plugin) => ({
      packageName: plugin.packageName,
      source: 'plugin' as const,
      routes: plugin.routes,
    })),
  );
}

describe('legacy plugin Dev authorization compatibility', () => {
  it('resolves all six installed Dev pages and keeps the Settings guard', () => {
    const runtime = resolve(clientPlugins);
    const group = runtime.devRouteTree.find(
      (route) => route.packageName === packageName,
    );
    expect(group?.children).toHaveLength(6);
    for (const page of group!.children!) {
      expect(page.auth).toBe('required');
      expect(page.authz).toBe('skip');
    }
    const settings = runtime.settings.filter(
      (route) => route.packageName === packageName,
    );
    expect(settings.length).toBeGreaterThan(0);
    for (const page of settings) expect(page.authz).toEqual(grant);
  });

  it('keeps Mail parent permissions and declares only the five legacy child guards', () => {
    const runtime = resolve(clientPlugins);
    const mail = runtime.devRouteTree.find(
      (route) => route.packageName === '@nocobase/app-plugin-mail',
    );
    for (const [name, children] of [
      ['send', ['compose', 'bulk']],
      ['logs', ['send', 'bulk', 'sync']],
    ] as const) {
      const parent = mail!.children!.find((route) => route.name === name)!;
      expect(parent.authz).toEqual({
        resource: { type: 'page', id: 'mail.workspace' },
        action: 'access',
      });
      expect(parent.children!.map((route) => route.name)).toEqual(children);
      for (const page of parent.children!) {
        expect(page.auth).toBe('required');
        expect(page.authz).toBe('skip');
      }
    }
    expect(
      runtime.settings.find(
        (route) => route.packageName === '@nocobase/app-plugin-mail',
      )!.authz,
    ).toEqual({
      resource: { type: 'page', id: 'mail.admin' },
      action: 'access',
    });
  });

  it('preserves explicit guards, production contributions and frozen originals', () => {
    const legacy = legacyPage('ai-knowledge-base-directory');
    const protectedPage = {
      ...legacyPage('ai-knowledge-base-documents'),
      authz: grant,
    };
    const settings = defineSettingsRoutes([{ ...legacy, authz: grant }]);
    const registration = defineClientPlugin({
      packageName,
      routes: [
        defineDevRoutes([
          {
            name: 'ai-knowledge-base',
            navigation: { title: 'Knowledge Base' },
            children: [legacy, protectedPage],
          },
        ]),
        settings,
      ],
    })();
    const input = defineClientPlugins([registration]);
    const output = withLegacyPluginDevAuthz(input);
    const pages = resolve(output).devRouteTree[0].children!;
    expect(pages[0].authz).toBe('skip');
    expect(pages[1].authz).toEqual(grant);
    expect(output.plugins[0].routes[1]).toBe(settings);
    expect(registration.routes[0].routes[0].children![0]).not.toHaveProperty(
      'authz',
    );
    expect(registration.routes[0].routes[0].children![0].componentLoader).toBe(
      output.plugins[0].routes[0].routes[0].children![0].componentLoader,
    );
    expect(withLegacyPluginDevAuthz(output)).toEqual(output);
  });

  it('still rejects new undeclared Dev pages and pages from other plugins', () => {
    for (const [owner, name] of [
      [packageName, 'ai-knowledge-base-new-page'],
      ['@example/other-plugin', 'ai-knowledge-base-directory'],
    ]) {
      const input = defineClientPlugins([
        defineClientPlugin({
          packageName: owner,
          routes: defineDevRoutes([legacyPage(name)]),
        })(),
      ]);
      expect(() => resolve(withLegacyPluginDevAuthz(input))).toThrow(
        'must declare authz',
      );
    }
  });
});
