import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import type { PermissionGrant } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';
import { APP_NS } from '@nocobase/i18n';

/**
 * Writes the Permission Sets the ticket feature ships with, and assigns them.
 *
 * These are *values*, not rules: an administrator may rename a set, change the
 * data scope of one of its grants, assign it to somebody else or delete it.
 * The rules themselves - the collection, the record access and the actions -
 * are declared in code and are what these grants are allowed to name; a grant
 * that names something undeclared is reported and skipped when it is resolved.
 *
 * The grant documents are spelled out rather than built from the feature's own
 * declaration. A stored grant is history: whatever the code says later, the
 * document a database already holds must keep meaning what it meant, and a seed
 * that imported the declaration would silently rewrite it whenever that
 * declaration changed. The shapes below are what the authorization plugin
 * stores and reads:
 *
 * - an action's `policy` is a composite scope: one entry per data scope the
 *   composite declares, here the single `tickets`, naming a Record Access key.
 * - `allRecords` is the built-in record access that selects every row.
 * - `it-tickets.submittedByMe` is declared in `server/it-tickets/authorization`
 *   and selects the rows whose `submitterId` is the signed-in account.
 *
 * Both sets are assigned per account rather than to the `authenticated`
 * audience. An audience-wide grant would work at runtime, but it would also
 * take the set off the Permission Sets picker in User management: the users
 * page treats a set that every signed-in account already holds as default
 * access, and only offers sets an administrator can actually hand to somebody.
 * The requirement is precisely that the work can be handed to a new colleague,
 * so the two demo reporters hold the employee set directly, and the same single
 * assignment gives the next colleague the same work.
 *
 * The names stay in this file rather than in a shared module: a seed is loaded
 * on its own, by its own path, and the data it writes is what an installation
 * already holds, so it must read the same however the rest of the source is
 * arranged.
 */

/** The page both sets may open, as the client route declares it in `authz`. */
const IT_TICKETS_PAGE_ID = 'itTickets';

const EMPLOYEE_SET = 'it-ticket-employee';
const HANDLER_SET = 'it-ticket-handler';

/** The same object `authz.pages.grant(pageId)` produces. */
function pageAccessGrant(pageId: string): PermissionGrant {
  return {
    resource: { type: 'page', id: pageId },
    actions: [{ action: 'access' }],
  };
}

/** One composite grant: the feature, one `tickets` scope per action. */
function ticketGrant(actions: readonly string[]): PermissionGrant {
  return {
    resource: { type: 'composite', id: IT_TICKETS_PAGE_ID },
    actions: actions.map((action) => ({
      action,
      policy: {
        type: 'composite',
        scopes: { tickets: 'it-tickets.submittedByMe' },
      },
    })),
  };
}

/** The handler's counterpart, over every ticket. */
function handlerTicketGrant(actions: readonly string[]): PermissionGrant {
  return {
    resource: { type: 'composite', id: IT_TICKETS_PAGE_ID },
    actions: actions.map((action) => ({
      action,
      policy: { type: 'composite', scopes: { tickets: 'allRecords' } },
    })),
  };
}

interface PermissionSetSeed {
  readonly key: string;
  /** The title as it is stored, resolved by the permission editor through the application's locale files. */
  readonly titleKey: string;
  readonly grants: readonly PermissionGrant[];
}

/**
 * - employee: may open the page, submit a ticket, and read only the tickets it
 *   submitted. The read scope is the `submittedByMe` record access, so a ticket
 *   that is not theirs is not returned at all - the page cannot see it and a
 *   direct link to it answers 404 rather than 403.
 * - handler: may open the page, read every ticket, and move one between the
 *   statuses. It deliberately holds no `create` action: a handler reports their
 *   own problems through the employee set like everybody else.
 *
 * Both hold the page grant, so giving a colleague the same work is a single
 * assignment on the Permission Sets page and no username is named anywhere in
 * the feature's own configuration.
 */
const PERMISSION_SETS: readonly PermissionSetSeed[] = [
  {
    key: EMPLOYEE_SET,
    titleKey: 'itTickets.permissionSet.employee',
    grants: [
      ticketGrant(['view', 'create']),
      pageAccessGrant(IT_TICKETS_PAGE_ID),
    ],
  },
  {
    key: HANDLER_SET,
    titleKey: 'itTickets.permissionSet.handler',
    grants: [
      handlerTicketGrant(['view', 'start', 'complete']),
      pageAccessGrant(IT_TICKETS_PAGE_ID),
    ],
  },
];

interface PermissionSetAssignmentSeed {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly permissionSetKey: string;
}

/**
 * The id convention the built-in sets use: subject type, subject id, set key.
 * A repeated run finds each assignment by that id and changes nothing, so an
 * administrator's later edit of an assignment is never overwritten.
 */
const ASSIGNMENTS: readonly PermissionSetAssignmentSeed[] = [
  {
    id: `user:demo-employee-1:${EMPLOYEE_SET}`,
    subjectType: 'user',
    subjectId: 'demo-employee-1',
    permissionSetKey: EMPLOYEE_SET,
  },
  {
    id: `user:demo-employee-2:${EMPLOYEE_SET}`,
    subjectType: 'user',
    subjectId: 'demo-employee-2',
    permissionSetKey: EMPLOYEE_SET,
  },
  {
    id: `user:demo-handler-1:${HANDLER_SET}`,
    subjectType: 'user',
    subjectId: 'demo-handler-1',
    permissionSetKey: HANDLER_SET,
  },
];

const seed = defineSeed({
  name: '202609210002_it_tickets_permission_sets',
  async run({ query }) {
    const now = new Date();

    for (const set of PERMISSION_SETS) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .limit(1)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: set.key,
          title: encodeAuthorizationTitle({ key: set.titleKey, ns: APP_NS }),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    for (const assignment of ASSIGNMENTS) {
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignment.id)
        .limit(1)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignment.id,
          subjectType: assignment.subjectType,
          subjectId: assignment.subjectId,
          permissionSetKey: assignment.permissionSetKey,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
