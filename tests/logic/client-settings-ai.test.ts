import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import clientPlugins from '../../client/plugins.ts';

/**
 * The AI Knowledge Base plugin contributes its settings page into the AI group
 * declared by the AI Employee plugin. Resolving every registered plugin the way
 * the client runtime does proves the group reference is satisfied and the page
 * is actually reachable under Settings — a missing plugin registration is the
 * difference between the page and the "request failed (404)" view QA observed.
 */
function resolveAllPlugins() {
  return resolveAppClientContributions(
    clientPlugins.plugins.map((plugin) => ({
      packageName: plugin.packageName,
      routes: plugin.routes,
      source: 'plugin' as const,
    })),
  );
}

function pagePaths(routes: readonly AppClientRegisteredRoute[]): string[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader ? [route.path] : []),
    ...pagePaths(route.children ?? []),
  ]);
}

function loadersIn(
  routes: readonly AppClientRegisteredRoute[],
): Array<() => Promise<{ default?: unknown }>> {
  return routes.flatMap((route) => [
    ...(route.componentLoader ? [route.componentLoader] : []),
    ...loadersIn(route.children ?? []),
  ]) as Array<() => Promise<{ default?: unknown }>>;
}

describe('AI settings surface', () => {
  it('reaches the knowledge-base and vector-database pages under the AI group', () => {
    const resolved = resolveAllPlugins();
    const aiGroup = resolved.settingsRouteTree.find(
      (route) => route.name === 'aiGroup',
    );

    expect(aiGroup).toBeDefined();
    expect(pagePaths([aiGroup as AppClientRegisteredRoute])).toEqual(
      expect.arrayContaining([
        '/settings/ai/knowledge-base',
        '/settings/ai/vector-database',
      ]),
    );
  });

  it('loads every AI settings page component', async () => {
    const resolved = resolveAllPlugins();
    const aiGroup = resolved.settingsRouteTree.find(
      (route) => route.name === 'aiGroup',
    ) as AppClientRegisteredRoute;
    const loaders = loadersIn([aiGroup]);

    expect(loaders.length).toBeGreaterThan(5);
    for (const loader of loaders) {
      await expect(loader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });
});
