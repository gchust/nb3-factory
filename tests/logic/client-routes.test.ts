import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';
import sourceExtensions from '../../client/source-extensions.ts';

describe('app client routes', () => {
  it('owns authentication pages instead of overriding plugin routes', () => {
    expect(sourceExtensions).toEqual([]);
    expect(routeComponentOverrides).toEqual([]);
  });

  it('declares application and settings route contributions', () => {
    expect(applicationRoutes).toHaveLength(2);
    expect(applicationRoutes[1]).toEqual({ parent: 'settings', routes: [] });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);
  });

  it('declares the rental pages plus authentication pages', () => {
    const registered = applicationRoutes[0].routes;
    expect(registered.map((route) => route.name)).toEqual([
      'home',
      'venues',
      'tenants',
      'calendar',
      'rentals',
      'rental-detail',
      'summary',
      'login',
      'register',
      'forgot-password',
      'reset-password',
    ]);
    for (const route of registered) {
      expect(route.auth === 'required' || route.auth === 'guest').toBe(true);
    }
  });

  it('gives every menu entry a navigation title and no title to the detail page', () => {
    const guestPages = new Set([
      'login',
      'register',
      'forgot-password',
      'reset-password',
    ]);
    for (const route of applicationRoutes[0].routes) {
      if (route.name === 'rental-detail') {
        expect(route.navigation).toBeUndefined();
      } else if (!guestPages.has(route.name)) {
        expect(route.navigation?.title).toBeTruthy();
      }
    }
  });

  it('resolves every page component lazily', async () => {
    for (const route of applicationRoutes[0].routes) {
      await expect(route.componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });
});
