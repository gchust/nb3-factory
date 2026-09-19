import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';
import sourceExtensions from '../../client/source-extensions.ts';

interface RouteLike {
  readonly name: string;
  readonly path?: string;
  readonly auth?: string;
  readonly navigation?: { readonly title: string };
  readonly componentLoader?: () => Promise<{ default: unknown }>;
  readonly children?: readonly RouteLike[];
}

function collect(routes: readonly RouteLike[]): readonly RouteLike[] {
  return routes.flatMap((route) => [
    route,
    ...(route.children ? collect(route.children) : []),
  ]);
}

describe('app client routes', () => {
  it('owns authentication pages instead of overriding plugin routes', () => {
    expect(sourceExtensions).toEqual([]);
    expect(routeComponentOverrides).toEqual([]);
  });

  it('declares application and settings route contributions', () => {
    expect(applicationRoutes).toHaveLength(2);
    const appContribution = applicationRoutes[0];
    expect(appContribution).toMatchObject({ parent: 'app' });
    expect(appContribution.routes.map((route) => route.name)).toEqual([
      'home',
      'expenses',
      'expenseApprovals',
      'expenseFinance',
      'expenseStatistics',
      'login',
      'register',
      'forgot-password',
      'reset-password',
    ]);
    expect(applicationRoutes[1]).toEqual({
      parent: 'settings',
      routes: [],
    });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);
  });

  it('declares the expense workflow routes and resolves every loader', async () => {
    const routes = applicationRoutes[0]
      .routes as unknown as readonly RouteLike[];
    const expenses = routes.find((route) => route.name === 'expenses');
    expect(expenses).toMatchObject({
      auth: 'required',
      path: '/expenses',
      navigation: { title: 'navigation.expenses' },
    });
    expect(expenses?.children?.map((route) => route.name)).toEqual([
      'expenseNew',
      'expenseDetail',
    ]);
    const detail = expenses?.children?.find(
      (route) => route.name === 'expenseDetail',
    );
    expect(detail?.path).toBe(':reportId');
    expect(detail?.children?.map((route) => route.name)).toEqual([
      'expenseEdit',
    ]);

    for (const route of collect(routes)) {
      if (route.componentLoader === undefined) continue;
      await expect(route.componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });

  it('gives every expense page a navigation entry', () => {
    const routes = applicationRoutes[0]
      .routes as unknown as readonly RouteLike[];
    const navigationTitles = collect(routes)
      .filter((route) => route.navigation !== undefined)
      .map((route) => route.navigation?.title);
    expect(navigationTitles).toEqual(
      expect.arrayContaining([
        'navigation.expenses',
        'navigation.expenseApprovals',
        'navigation.expenseFinance',
        'navigation.expenseStatistics',
      ]),
    );
  });
});
