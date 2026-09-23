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
    expect(applicationRoutes[0]).toMatchObject({
      parent: 'app',
      routes: [
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
        {
          auth: 'required',
          authz: 'skip',
          name: 'crmCustomers',
          path: '/crm/customers',
          children: [
            { name: 'crmCustomerNew', path: 'new' },
            { name: 'crmCustomerDetail', path: ':customerId' },
            { name: 'crmCustomerEdit', path: ':customerId/edit' },
          ],
        },
        {
          auth: 'required',
          authz: 'skip',
          name: 'crmContacts',
          path: '/crm/contacts',
          children: [
            { name: 'crmContactNew', path: 'new' },
            { name: 'crmContactEdit', path: ':contactId/edit' },
          ],
        },
        {
          auth: 'required',
          authz: 'skip',
          name: 'crmOpportunities',
          path: '/crm/opportunities',
          children: [
            { name: 'crmOpportunityNew', path: 'new' },
            { name: 'crmOpportunityEdit', path: ':opportunityId/edit' },
          ],
        },
      ],
    });
    expect(applicationRoutes[1]).toEqual({
      parent: 'settings',
      routes: [],
    });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);
    for (const route of applicationRoutes[0].routes) {
      await expect(route.componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
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
      // The landing page and every CRM page opted out of page authorization, so they are reachable by every
      // signed-in user. There is one ordinary usage mode and no role system behind these pages.
      { name: 'home', authorizedAs: null },
      { name: 'crmCustomers', authorizedAs: null },
      { name: 'crmCustomerNew', authorizedAs: null },
      { name: 'crmCustomerDetail', authorizedAs: null },
      { name: 'crmCustomerEdit', authorizedAs: null },
      { name: 'crmContacts', authorizedAs: null },
      { name: 'crmContactNew', authorizedAs: null },
      { name: 'crmContactEdit', authorizedAs: null },
      { name: 'crmOpportunities', authorizedAs: null },
      { name: 'crmOpportunityNew', authorizedAs: null },
      { name: 'crmOpportunityEdit', authorizedAs: null },
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
