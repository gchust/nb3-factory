import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';
import sourceExtensions from '../../client/source-extensions.ts';
import type {
  AppClientRouteDefinition,
  AppClientRouteGroupDefinition,
} from '@nocobase/app-client/plugins';

describe('app client routes', () => {
  it('owns authentication pages instead of overriding plugin routes', () => {
    expect(sourceExtensions).toEqual([]);
    expect(routeComponentOverrides).toEqual([]);
  });

  it('declares application and settings route contributions', async () => {
    expect(applicationRoutes).toHaveLength(2);
    expect(applicationRoutes[0]).toMatchObject({ parent: 'app' });
    expect(applicationRoutes[1]).toEqual({
      parent: 'settings',
      routes: [],
    });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);

    const routes = applicationRoutes[0].routes;
    expect(routes.map((route) => route.name)).toEqual([
      'home',
      'procurement',
      'login',
      'register',
      'forgot-password',
      'reset-password',
    ]);
    expect(routes[0]).toMatchObject({ auth: 'required', path: '/' });

    const group = routes[1] as AppClientRouteGroupDefinition;
    expect(group).toMatchObject({ auth: 'required', name: 'procurement' });
    expect(group.children.map((child) => child.name)).toEqual([
      'procurement-dashboard',
      'procurement-suppliers',
      'procurement-materials',
      'procurement-orders',
      'procurement-todos',
      'procurement-receipts',
    ]);

    for (const page of collectPages(routes)) {
      expect(page.path.startsWith('/')).toBe(true);
      await expect(page.componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });
});

function collectPages(
  routes: readonly AppClientRouteDefinition[],
): { path: string; componentLoader: () => Promise<unknown> }[] {
  const pages: { path: string; componentLoader: () => Promise<unknown> }[] = [];
  for (const route of routes) {
    if (route.componentLoader) {
      pages.push({
        path: String(route.path),
        componentLoader: route.componentLoader,
      });
    }
    if (route.children) {
      pages.push(...collectPages(route.children));
    }
  }
  return pages;
}
