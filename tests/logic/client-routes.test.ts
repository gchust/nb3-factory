import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';
import sourceExtensions from '../../client/source-extensions.ts';

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
        { auth: 'required', name: 'home', path: '/' },
        {
          name: 'quality',
          children: [
            {
              name: 'quality-batches',
              path: '/quality/batches',
              children: [
                { name: 'quality-batch-create', path: 'create' },
                { name: 'quality-product-create', path: 'create-product' },
              ],
            },
            {
              name: 'quality-tasks',
              path: '/quality/tasks',
              children: [
                { name: 'quality-task-create', path: 'create' },
                { name: 'quality-task-detail', path: ':taskId' },
              ],
            },
            {
              name: 'quality-my-inspections',
              path: '/quality/my-inspections',
              children: [{ name: 'quality-inspection-run', path: ':taskId' }],
            },
            {
              name: 'quality-results',
              path: '/quality/results',
              children: [{ name: 'quality-result-detail', path: ':taskId' }],
            },
            {
              name: 'quality-rectifications',
              path: '/quality/rectifications',
              children: [{ name: 'quality-rectification-detail', path: ':id' }],
            },
            { name: 'quality-stats', path: '/quality/stats' },
          ],
        },
        { auth: 'guest', name: 'login', path: '/login' },
        { auth: 'guest', name: 'register', path: '/register' },
        {
          auth: 'guest',
          name: 'forgot-password',
          path: '/forgot-password',
        },
        { auth: 'guest', name: 'reset-password', path: '/reset-password' },
      ],
    });
    expect(applicationRoutes[1]).toEqual({
      parent: 'settings',
      routes: [],
    });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);

    const loaders = collectComponentLoaders(applicationRoutes[0].routes);
    expect(loaders.length).toBeGreaterThan(0);
    for (const load of loaders) {
      await expect(load()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });
});

interface RouteLike {
  readonly name?: string;
  readonly children?: readonly RouteLike[];
  readonly componentLoader?: () => Promise<unknown>;
}

function collectComponentLoaders(
  routes: readonly RouteLike[],
): readonly (() => Promise<unknown>)[] {
  const loaders: (() => Promise<unknown>)[] = [];
  for (const route of routes) {
    if (route.componentLoader) loaders.push(route.componentLoader);
    if (route.children)
      loaders.push(...collectComponentLoaders(route.children));
  }
  return loaders;
}
