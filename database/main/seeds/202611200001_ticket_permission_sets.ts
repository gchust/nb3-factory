import { randomUUID } from 'node:crypto';

import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import type { PermissionGrant } from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { defineSeed } from '@nocobase/db';

/*
 * The initial job permission sets for the IT service desk.
 *
 * These are values, not registrations: this seed persists them once so an administrator can keep editing them in the
 * permission workspace afterwards. Nothing here runs on boot, and a later change to a set's grants reaches an existing
 * installation only through an explicit data change, never by overwriting what an administrator configured.
 *
 * The three sets follow the three jobs in the requirement:
 *
 * - `employee` reports a repair request and decides whether the fix is acceptable. It reaches only the tickets it
 *   reported, and cannot assign, handle or close anything.
 * - `engineer` handles the tickets the service desk handed over. It reaches only the tickets assigned to it.
 * - `service-desk` triages everything: it sees every ticket, assigns it to an engineer, and reads the process
 *   administration.
 *
 * The composite grant is written here in the stored shape rather than through `tickets.reference()`, because the
 * database runner loads a seed as a module of its own and this file must stay importable everywhere the runner works.
 * `tests/logic/ticket-permission-sets.test.ts` checks the stored shape against the composite declaration in
 * `server/tickets/resources.ts`, so the two cannot drift apart silently.
 */

/**
 * The stored shape of a grant on the `tickets` composite: each action names the data scope key of every collection it
 * grants, exactly as `defineCompositeResource` declared them.
 */
function ticketGrant(
  actions: Readonly<Record<string, Readonly<Record<string, string>>>>,
): PermissionGrant {
  return {
    resource: { type: 'composite', id: 'tickets' },
    actions: Object.entries(actions).map(([action, scopes]) => ({
      action,
      policy: { type: 'composite', scopes },
    })),
  };
}

/** A page grant lets its holder open the page; the page itself still asks the composite for its data. */
function pageGrant(id: string): PermissionGrant {
  return { resource: { type: 'page', id }, actions: [{ action: 'access' }] };
}

export const ticketEmployeeSet = definePermissionSet('employee')
  .title('Employee / 报修员工')
  .grant(pageGrant('tickets.list'), pageGrant('tickets.new'), pageGrant('tickets.detail'))
  .grant(
    ticketGrant({
      view: { tickets: 'tickets.reportedByMe' },
      create: { tickets: 'tickets.allTickets' },
      comment: {
        tickets: 'tickets.reportedByMe',
        ticketComments: 'tickets.allComments',
      },
      confirm: { tickets: 'tickets.reportedByMe' },
    }),
  )
  .build();

export const ticketEngineerSet = definePermissionSet('engineer')
  .title('Engineer / 维修工程师')
  .grant(pageGrant('tickets.list'), pageGrant('tickets.detail'))
  .grant(
    ticketGrant({
      view: { tickets: 'tickets.assignedToMe' },
      comment: {
        tickets: 'tickets.assignedToMe',
        ticketComments: 'tickets.allComments',
      },
      handle: { tickets: 'tickets.assignedToMe' },
    }),
  )
  .build();

export const ticketServiceDeskSet = definePermissionSet('service-desk')
  .title('Service desk / 服务台')
  .grant(
    pageGrant('tickets.list'),
    pageGrant('tickets.new'),
    pageGrant('tickets.detail'),
    pageGrant('service-desk'),
  )
  .grant(
    ticketGrant({
      view: { tickets: 'tickets.allTickets' },
      create: { tickets: 'tickets.allTickets' },
      comment: {
        tickets: 'tickets.allTickets',
        ticketComments: 'tickets.allComments',
      },
      assign: { tickets: 'tickets.allTickets' },
      handle: { tickets: 'tickets.allTickets' },
      confirm: { tickets: 'tickets.allTickets' },
      dashboard: { tickets: 'tickets.allTickets' },
      lifecycle: { tickets: 'tickets.allTickets' },
    }),
  )
  .build();

export const ticketPermissionSets = [
  ticketEmployeeSet,
  ticketEngineerSet,
  ticketServiceDeskSet,
] as const;

/**
 * Two things are written once, and only once:
 *
 * 1. The three job permission sets, so the application is usable immediately: every signed-in person can report a
 *    repair request and see their own, and the person who installed the application runs the desk.
 * 2. Their baseline assignments — every authenticated identity holds `employee`, and every administrator holds
 *    `service-desk`.
 *
 * The `engineer` set is created but assigned to nobody: it names a colleague, and which colleague is the service
 * desk's decision, made on the Roles page. A technician added there becomes assignable and sees exactly the tickets
 * handed to them.
 *
 * Every insert checks for an existing row first, so re-running the seed on an installation where an administrator has
 * since edited a set adds nothing back.
 */
export default defineSeed({
  name: '202611200001_ticket_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    for (const set of ticketPermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title ?? set.key),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assign = async (
      permissionSetKey: string,
      subjectType: 'user' | 'authenticated',
      subjectId: string,
    ) => {
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('permissionSetKey', '=', permissionSetKey)
        .where('subjectType', '=', subjectType)
        .where('subjectId', '=', subjectId)
        .executeTakeFirst();
      if (existing) {
        return;
      }
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: randomUUID(),
          permissionSetKey,
          subjectType,
          subjectId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    };

    // Every signed-in person reports and tracks their own repair requests.
    await assign(ticketEmployeeSet.key, 'authenticated', '*');

    // Whoever installed the application runs the service desk. The root set is assigned to that account by the
    // installation itself, so this picks the identity up instead of inventing one.
    const administrators = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('subjectId')
      .where('permissionSetKey', '=', 'root')
      .where('subjectType', '=', 'user')
      .execute();
    for (const row of administrators) {
      // The column is a text key; the guard keeps an unexpected value from becoming a permission assignment.
      const subjectId =
        typeof row.subjectId === 'string'
          ? row.subjectId
          : typeof row.subjectId === 'number'
            ? String(row.subjectId)
            : '';
      if (subjectId) {
        await assign(ticketServiceDeskSet.key, 'user', subjectId);
      }
    }
  },
});
