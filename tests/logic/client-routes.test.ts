import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
  type AppClientRouteComponentLoader,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import { matchRouteTree } from '../../client/routing/route-navigation.ts';
import applicationRoutes from '../../client/routes.ts';

describe('app client routes', () => {
  it('keeps the landing page and the authentication pages', () => {
    // The authentication plugin and this application have to agree on these paths: it sends an unknown visitor to
    // /login, sends a signed-in user who opens a guest page back to /, and mails a reset link to /reset-password,
    // while the sign-in form links to /register and /forgot-password. Only their presence is asserted, so a page the
    // application adds is not a defect. Whether these four are guest pages is not checked here either: app-client
    // refuses any route that claims one of those paths without `auth: 'guest'`.
    expect(pagePaths(resolveRoutes().routes)).toEqual(
      expect.arrayContaining([
        '/',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
      ]),
    );
  });

  it('resolves the service pages to the declared application paths', () => {
    // A navigation group with no `path` of its own lets each child carry the full application path. Declaring a
    // path on the group as well makes app-client prepend it to every child, registering each page under a doubled
    // prefix (/service/service/...) and turning the ticket record link into a route that matches nothing. This pins
    // the resolved paths so a group path added back, or a child switched to a relative path, fails here instead of
    // in the browser.
    const resolved = resolveRoutes();
    const paths = pagePaths(resolved.routes);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/service',
        '/service/customers',
        '/service/devices',
        '/service/tickets',
        '/service/tickets/:ticketId',
        '/service/inspections',
        '/service/knowledge',
        '/service/manuals',
        '/service/assistant',
        '/service/messages',
        '/service/operations',
      ]),
    );
    expect(paths.filter((path) => path.includes('/service/service'))).toEqual(
      [],
    );
  });

  it('matches the landing page at / and the ticket record under its list', () => {
    // The pathless navigation group resolves to the root path but declares no component, so it matches only as a
    // prefix of its children. This checks the group did not swallow the landing page, and that the ticket record
    // link (relative to the list) resolves to the list page with the record route on top.
    const routes = resolveRoutes().routes;
    expect(
      matchRouteTree(routes, '/')?.map((match) => match.route.name),
    ).toEqual(['home']);
    expect(
      matchRouteTree(routes, '/service/tickets/1')?.map(
        (match) => match.route.name,
      ),
    ).toEqual(['service', 'service-tickets', 'service-ticket-detail']);
  });

  it('loads every page component', async () => {
    const resolved = resolveRoutes();
    const loaders = [
      ...componentLoadersIn(resolved.routes),
      ...componentLoadersIn(resolved.settingsRouteTree),
      ...componentLoadersIn(resolved.devRouteTree),
    ];
    // The trees above are filtered by loader, so an empty list would make the loop below pass without loading
    // anything at all.
    expect(loaders).not.toHaveLength(0);

    for (const componentLoader of loaders) {
      // The registered loader is already the wrapped one, so awaiting it holds every page to the contract that its
      // module default-exports a component. A page that moved or lost its default export fails here.
      await expect(componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });

  it('pins the page authorization of every signed-in page', () => {
    // A stored page grant records the page's `authz` resource id (`authorizedAs`), not its route `name`: changing an
    // id is a data change that has to migrate the grants that reference it, not a refactor — so changing this list
    // deliberately is the point. A new page that requires sign-in adds an entry here, because a page that checks
    // access is a new grant somebody has to be given.
    const resolved = resolveRoutes();

    // The landing page opted out of page authorization, so it is reachable by every signed-in user.
    // The equipment service pages below declare `authz: page(...)`, whose id is stored on the
    // page grant an administrator gives a job set (see `server/service-authorization.ts`).
    expect(pageAuthorizations(resolved.routes)).toEqual([
      { name: 'home', authorizedAs: null },
      { name: 'service-dashboard', authorizedAs: 'service.dashboard' },
      { name: 'service-customers', authorizedAs: 'service.customers' },
      { name: 'service-devices', authorizedAs: 'service.devices' },
      { name: 'service-tickets', authorizedAs: 'service.tickets' },
      // The record page declares no `authz` of its own and inherits the list page's.
      { name: 'service-ticket-detail', authorizedAs: 'service.tickets' },
      { name: 'service-inspections', authorizedAs: 'service.inspections' },
      { name: 'service-knowledge', authorizedAs: 'service.knowledge' },
      { name: 'service-manuals', authorizedAs: 'service.manuals' },
      { name: 'service-assistant', authorizedAs: 'service.assistant' },
      { name: 'service-messages', authorizedAs: 'service.messages' },
      { name: 'service-operations', authorizedAs: 'service.operations' },
    ]);
  });
});

/** This application's own contribution, registered the way the client runtime registers it. */
function resolveRoutes() {
  return resolveAppClientContributions([
    {
      packageName: '@nocobase/app-template-default',
      routes: applicationRoutes,
      source: 'application',
    },
  ]);
}

/**
 * The paths of the pages a route tree registers. A menu group names no component, so it carries no path of its own
 * and inherits its parent's — filtering on `componentLoader` is what keeps that inherited path out of the list.
 */
function pagePaths(routes: readonly AppClientRegisteredRoute[]): string[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader ? [route.path] : []),
    ...pagePaths(route.children ?? []),
  ]);
}

/** Every page loader in a tree, at any depth. */
function componentLoadersIn(
  routes: readonly AppClientRegisteredRoute[],
): AppClientRouteComponentLoader[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader ? [route.componentLoader] : []),
    ...componentLoadersIn(route.children ?? []),
  ]);
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
                : route.authz === 'unrestricted'
                  ? 'unrestricted'
                  : route.authz.resource.type === 'page'
                    ? route.authz.resource.id
                    : `${route.authz.resource.type}:${route.authz.resource.id}`,
          },
        ]
      : []),
    ...pageAuthorizations(route.children ?? []),
  ]);
}
