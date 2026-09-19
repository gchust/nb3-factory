import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';
import sourceExtensions from '../../client/source-extensions.ts';

interface RouteLike {
  readonly name?: string;
  readonly path?: string;
  readonly auth?: string;
  readonly navigation?: { readonly title: string };
  readonly breadcrumb?: { readonly title: string };
  readonly componentLoader?: () => Promise<{ default: unknown }>;
  readonly children?: readonly RouteLike[];
}

describe('app client routes', () => {
  it('owns authentication pages instead of overriding plugin routes', () => {
    expect(sourceExtensions).toEqual([]);
    expect(routeComponentOverrides).toEqual([]);
  });

  it('declares application and settings route contributions', async () => {
    expect(applicationRoutes).toHaveLength(2);
    expect(applicationRoutes[1]).toEqual({
      parent: 'settings',
      routes: [],
    });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);
  });

  it('declares the top-level application routes', () => {
    const routes = applicationRoutes[0].routes as readonly RouteLike[];
    expect(routes.map((route) => route.name)).toEqual([
      'home',
      'training',
      'login',
      'register',
      'forgot-password',
      'reset-password',
    ]);
    const home = routes[0];
    expect(home).toMatchObject({
      auth: 'required',
      name: 'home',
      path: '/',
    });
    for (const guest of routes.slice(2)) {
      expect(guest.auth).toBe('guest');
    }
  });

  it('declares the training pages under one navigation group', () => {
    const routes = applicationRoutes[0].routes as readonly RouteLike[];
    const training = routes.find((route) => route.name === 'training');
    expect(training).toBeDefined();
    expect(training?.componentLoader).toBeUndefined();
    const children = training?.children ?? [];
    const byName = new Map(
      children.map((child) => [child.name, child] as const),
    );
    expect(byName.get('trainingCatalog')?.path).toBe('/training/catalog');
    expect(byName.get('trainingMyLearning')?.path).toBe(
      '/training/my-learning',
    );
    expect(byName.get('trainingGrading')?.path).toBe('/training/grading');
    expect(byName.get('trainingStats')?.path).toBe('/training/stats');
    expect(byName.get('trainingManage')?.path).toBe('/training/manage');
    expect(byName.get('trainingSessionDetail')?.path).toBe(
      '/training/sessions/:sessionId',
    );
    expect(byName.get('trainingAssignmentDetail')?.path).toBe(
      '/training/assignments/:assignmentId',
    );

    const manageChildren = byName.get('trainingManage')?.children ?? [];
    expect(manageChildren.map((child) => child.path)).toEqual([
      'courses',
      'sessions',
    ]);

    for (const child of children) {
      if (child.name === 'trainingSessionDetail') {
        expect(child.navigation).toBeUndefined();
      }
    }
  });

  it('loads every declared page component', async () => {
    const routes = applicationRoutes[0].routes as readonly RouteLike[];
    const loaders: Array<() => Promise<{ default: unknown }>> = [];
    const collect = (definitions: readonly RouteLike[]): void => {
      for (const definition of definitions) {
        if (definition.componentLoader)
          loaders.push(definition.componentLoader);
        if (definition.children) collect(definition.children);
      }
    };
    collect(routes);

    expect(loaders.length).toBeGreaterThanOrEqual(7);
    for (const loader of loaders) {
      await expect(loader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });
});
