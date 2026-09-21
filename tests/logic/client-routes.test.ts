import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';
import sourceExtensions from '../../client/source-extensions.ts';

const contribution = () => [
  {
    packageName: '@nocobase/app-template-default',
    routes: applicationRoutes,
    source: 'application' as const,
  },
];

describe('app client routes', () => {
  it('owns authentication pages instead of overriding plugin routes', () => {
    expect(sourceExtensions).toEqual([]);
    expect(routeComponentOverrides).toEqual([]);
  });

  it('declares application and settings route contributions', async () => {
    expect(applicationRoutes).toHaveLength(2);
    expect(applicationRoutes[0]).toMatchObject({
      parent: 'app',
      routes: [
        {
          auth: 'required',
          authz: 'skip',
          name: 'dashboard',
          path: '/',
        },
        { auth: 'guest', name: 'login', path: '/login' },
        { auth: 'guest', name: 'register', path: '/register' },
        {
          auth: 'guest',
          name: 'forgot-password',
          path: '/forgot-password',
        },
        { auth: 'guest', name: 'reset-password', path: '/reset-password' },
        { auth: 'required', name: 'laboratory' },
      ],
    });
    expect(applicationRoutes[1]).toEqual({
      parent: 'settings',
      routes: [],
    });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);
    for (const route of walk(applicationRoutes[0].routes)) {
      if (!route.componentLoader) {
        continue;
      }
      await expect(route.componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });

  it('resolves one navigation group holding every business module', () => {
    const { routes } = resolveAppClientContributions(contribution());
    const group = routes.find((route) => route.name === 'laboratory');

    // A group owns no page of its own, so it declares navigation and children and no component loader. Its path is
    // optional and resolves to the application root; the navigation tree renders it as a plain header.
    expect(group?.componentLoader).toBeUndefined();
    expect(group?.path).toBe('/');
    expect(group?.children?.map((child) => [child.name, child.path])).toEqual([
      ['laboratories', '/laboratories'],
      ['equipment', '/equipment'],
      ['calibrations', '/calibrations'],
      ['work-orders', '/work-orders'],
      ['safety-checks', '/safety-checks'],
      ['training-records', '/training-records'],
    ]);

    // A child declares its path relative to its parent and the resolved path is what the browser sees. Declaring the
    // full path in the child would repeat the parent segment (`/equipment/equipment/:equipmentId`).
    const equipment = group?.children?.find(
      (child) => child.name === 'equipment',
    );
    const workOrders = group?.children?.find(
      (child) => child.name === 'work-orders',
    );
    expect(equipment?.children?.map((child) => child.path)).toEqual([
      '/equipment/:equipmentId',
    ]);
    expect(workOrders?.children?.map((child) => child.path)).toEqual([
      '/work-orders/:workOrderId',
    ]);
  });

  it('pins the route names page grants are stored against', () => {
    // A route's `name` is the identifier a stored page grant records. Renaming one is a data change that has to
    // migrate the grants that name it, not a refactor — so changing this list deliberately is the point.
    const resolved = resolveAppClientContributions(contribution());

    // Every business page opts out of page authorization on purpose: who may see what is decided by the API per
    // laboratory and per record, so a page check here would only duplicate a weaker copy of the same rule.
    expect(pageAuthorizations(resolved.routes)).toEqual([
      { name: 'dashboard', authorizedAs: null },
      { name: 'laboratories', authorizedAs: null },
      { name: 'equipment', authorizedAs: null },
      { name: 'equipment-detail', authorizedAs: null },
      { name: 'calibrations', authorizedAs: null },
      { name: 'work-orders', authorizedAs: null },
      { name: 'work-order-detail', authorizedAs: null },
      { name: 'safety-checks', authorizedAs: null },
      { name: 'training-records', authorizedAs: null },
    ]);
  });
});

/** Every declared route, parents before children, for assertions that do not care about the nesting. */
function walk(
  routes: readonly { children?: readonly any[]; [key: string]: any }[],
): { componentLoader?: unknown; [key: string]: any }[] {
  return routes.flatMap((route) => [route, ...walk(route.children ?? [])]);
}

/** Page authorization comes directly from the registered tree. */
function pageAuthorizations(
  routes: readonly AppClientRegisteredRoute[],
): { name: string; authorizedAs: string | null }[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader && route.auth === 'required'
      ? [
          {
            name: route.name,
            authorizedAs:
              route.authz === 'skip'
                ? null
                : route.authz.resource.type === 'page'
                  ? route.authz.resource.id
                  : `${route.authz.resource.type}:${route.authz.resource.id}`,
          },
        ]
      : []),
    ...pageAuthorizations(route.children ?? []),
  ]);
}
