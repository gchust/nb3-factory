// @vitest-environment node

import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import {
  TICKET_STATUSES,
  TICKET_URGENCIES,
  isTicketStatus,
  isTicketUrgency,
} from '../../client/hooks/itsm.ts';

/**
 * The service desk's route contract: the pages exist, the menu names them, and the record overlays are pages without
 * menu entries. The server's own scope checks are not asserted here — this is the client tree only.
 */
describe('service desk routes', () => {
  it('registers the dashboard, ticket and team pages', () => {
    expect(pagePaths(resolveRoutes().routes)).toEqual(
      expect.arrayContaining([
        '/',
        '/ticket/:ticketId',
        '/tickets',
        '/tickets/new',
        '/tickets/:ticketId',
        '/team',
      ]),
    );
  });

  it('keeps the ticket overlays out of the menu and the group without a path of its own', () => {
    const group = applicationRoutes[0].routes.find(
      (route) => route.name === 'service-desk',
    );
    expect(group).not.toHaveProperty('path');
    expect(group).not.toHaveProperty('componentLoader');
    expect(group).toHaveProperty('navigation.title', 'navigation.serviceDesk');

    const tickets = group?.children?.find((route) => route.name === 'tickets');
    expect(tickets).toHaveProperty('navigation.title', 'navigation.tickets');
    for (const child of tickets?.children ?? []) {
      expect(child).not.toHaveProperty('navigation');
    }
  });

  it('points the dashboard and the tickets page at the shared drawer', () => {
    const dashboard = applicationRoutes[0].routes.find(
      (route) => route.name === 'home',
    );
    expect(dashboard?.children?.[0]).toMatchObject({
      name: 'dashboard-ticket',
      path: 'ticket/:ticketId',
    });
  });
});

describe('ticket vocabulary', () => {
  it('accepts only the statuses and urgencies the server uses', () => {
    for (const status of TICKET_STATUSES)
      expect(isTicketStatus(status)).toBe(true);
    for (const urgency of TICKET_URGENCIES)
      expect(isTicketUrgency(urgency)).toBe(true);
    expect(isTicketStatus('escalated')).toBe(false);
    expect(isTicketStatus(null)).toBe(false);
    expect(isTicketUrgency('critical')).toBe(false);
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

/** The paths of the pages a route tree registers; a menu group names no component and carries no page path. */
function pagePaths(routes: readonly AppClientRegisteredRoute[]): string[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader ? [route.path] : []),
    ...pagePaths(route.children ?? []),
  ]);
}
