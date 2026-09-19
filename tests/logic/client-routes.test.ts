import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';
import sourceExtensions from '../../client/source-extensions.ts';

interface RouteLike {
  readonly name: string;
  readonly path?: string;
  readonly auth?: string;
  readonly componentLoader?: () => Promise<unknown>;
  readonly children?: readonly RouteLike[];
}

describe('app client routes', () => {
  it('owns authentication pages instead of overriding plugin routes', () => {
    expect(sourceExtensions).toEqual([]);
    expect(routeComponentOverrides).toEqual([]);
  });

  it('declares application and settings route contributions', () => {
    expect(applicationRoutes).toHaveLength(2);
    expect(applicationRoutes[1]).toEqual({
      parent: 'settings',
      routes: [],
    });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);

    const routes = applicationRoutes[0].routes as readonly RouteLike[];
    expect(routes.map((route) => route.name)).toEqual([
      'home',
      'recruitment',
      'login',
      'register',
      'forgot-password',
      'reset-password',
    ]);
    expect(routes[0]).toMatchObject({
      auth: 'required',
      name: 'home',
      path: '/',
    });
    expect(routes[1].children?.map((route) => route.name)).toEqual([
      'recruitment-positions',
      'recruitment-candidates',
      'recruitment-interviews',
      'recruitment-onboarding',
      'recruitment-stats',
    ]);
  });

  it('exposes every declared page through a lazy component loader', async () => {
    const seen: string[] = [];
    const visit = async (routes: readonly RouteLike[]): Promise<void> => {
      for (const route of routes) {
        if (route.componentLoader) {
          seen.push(route.name);
          await expect(route.componentLoader()).resolves.toMatchObject({
            default: expect.any(Function),
          });
        }
        if (route.children) await visit(route.children);
      }
    };
    await visit(applicationRoutes[0].routes as readonly RouteLike[]);
    expect(seen).toEqual([
      'home',
      'recruitment-positions',
      'recruitment-candidates',
      'recruitment-interviews',
      'recruitment-onboarding',
      'recruitment-stats',
      'login',
      'register',
      'forgot-password',
      'reset-password',
    ]);
  });
});
