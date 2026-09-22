import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
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
    expect(applicationRoutes[0]).toMatchObject({ parent: 'app' });
    // The landing page and the application-owned authentication pages stay first; application
    // pages may be appended to the same contribution.
    expect(applicationRoutes[0].routes.slice(0, 5)).toMatchObject([
      {
        auth: 'required',
        name: 'home',
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
    ]);
    expect(applicationRoutes[1]).toEqual({
      parent: 'settings',
      routes: [],
    });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);
    for (const route of applicationRoutes[0].routes) {
      if (route.componentLoader) {
        await expect(route.componentLoader()).resolves.toMatchObject({
          default: expect.any(Function),
        });
      }
      for (const child of route.children ?? []) {
        if (!child.componentLoader) continue;
        await expect(child.componentLoader()).resolves.toMatchObject({
          default: expect.any(Function),
        });
      }
    }
  });

  it('pins the route names page grants are stored against', () => {
    // A route's `name` is the identifier a stored page grant records. Renaming one is a data change that has to
    // migrate the grants that name it, not a refactor — so changing this list deliberately is the point.
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-default',
        routes: applicationRoutes,
        source: 'application',
      },
    ]);

    expect(pageAuthorizations(resolved.routes)).toEqual([
      // The landing page opted out of page authorization, so it is reachable by every signed-in user.
      { name: 'home', authorizedAs: null },
      { name: 'serviceDashboard', authorizedAs: 'service.dashboard' },
      { name: 'serviceTickets', authorizedAs: 'service.tickets' },
      { name: 'serviceTicketDetail', authorizedAs: null },
      { name: 'serviceCustomers', authorizedAs: 'service.customers' },
      { name: 'serviceDevices', authorizedAs: 'service.devices' },
      { name: 'serviceKnowledge', authorizedAs: 'service.knowledge' },
      { name: 'serviceKnowledgeDetail', authorizedAs: null },
      { name: 'serviceInspections', authorizedAs: 'service.inspections' },
      { name: 'serviceAutomation', authorizedAs: 'service.automation' },
      { name: 'serviceAssistant', authorizedAs: 'service.assistant' },
      { name: 'serviceMessages', authorizedAs: null },
      { name: 'serviceTeam', authorizedAs: 'service.members' },
    ]);
  });
});

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
