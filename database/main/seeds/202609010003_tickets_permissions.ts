import { databaseGrant } from '@nocobase/app-plugin-authorization';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { permissionSet } from '@nocobase/authorization/permissions';
import { defineSeed } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

/**
 * Persist the two job permission sets and assign the seeded accounts to them.
 *
 * These are ordinary persisted permission sets, not code-owned rules: an
 * administrator can change what an employee or a handler may do from the
 * permission UI, and this seed will not overwrite that later.
 *
 * The grants are written out here rather than imported from a shared module.
 * A seed is a record of what the application installed at one point, so it has
 * to keep meaning the same thing when the business field lists change later;
 * an import would silently rewrite what this already-executed seed granted.
 *
 * Page access and data access are independent grants. An employee reaches the
 * page, reads only the tickets they submitted and creates new ones. A handler
 * reaches the page, reads every ticket and updates the handling columns; the
 * server still owns the state machine and the handler column.
 */

const COLLECTION = 'tickets';
const PAGE = 'tickets';
const SUBMITTED_SCOPE = 'tickets.submitted';

const TICKET_FIELDS = [
  'id',
  'title',
  'category',
  'description',
  'submitterId',
  'handlerId',
  'status',
  'handlingNote',
  'createdAt',
  'updatedAt',
];

const TICKET_CREATE_FIELDS = [
  'title',
  'category',
  'description',
  'submitterId',
  'status',
  'createdAt',
  'updatedAt',
];

const TICKET_UPDATE_FIELDS = [
  'status',
  'handlingNote',
  'handlerId',
  'updatedAt',
];

const pageGrant = {
  resource: { type: 'page', id: PAGE },
  actions: [{ action: 'access' }],
} as const;

const ticketsPermissionSets = [
  permissionSet('it-employee')
    .title({ key: 'tickets.permissionSets.employee', ns: 'crm' })
    .grant(pageGrant)
    .grant(
      databaseGrant(COLLECTION, {
        read: {
          recordAccess: [{ key: SUBMITTED_SCOPE }],
          fields: TICKET_FIELDS,
        },
        create: { fields: TICKET_CREATE_FIELDS },
      }),
    )
    .build(),
  permissionSet('it-handler')
    .title({ key: 'tickets.permissionSets.handler', ns: 'crm' })
    .grant(pageGrant)
    .grant(
      databaseGrant(COLLECTION, {
        read: { recordAccess: ['allRecords'], fields: TICKET_FIELDS },
        update: {
          recordAccess: ['allRecords'],
          fields: TICKET_UPDATE_FIELDS,
        },
      }),
    )
    .build(),
];

const ASSIGNMENTS: Readonly<Record<string, string>> = {
  employee1: 'it-employee',
  employee2: 'it-employee',
  handler1: 'it-handler',
};

export default defineSeed({
  name: '202609010003_tickets_permissions',
  async run({ query }) {
    const now = new Date();

    for (const set of ticketsPermissionSets) {
      const existingSet = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (!existingSet) {
        await query
          .insertInto('authorizationPermissionSets')
          .values({
            id: randomUUID(),
            key: set.key,
            title: encodeAuthorizationTitle(set.title),
            grants: JSON.stringify(set.grants),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }

    for (const [username, setKey] of Object.entries(ASSIGNMENTS)) {
      const user = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .executeTakeFirst();
      if (!user) {
        continue;
      }

      const userId = String(user.id);
      const assignmentId = `user:${userId}:${setKey}`;
      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', assignmentId)
        .executeTakeFirst();
      if (existingAssignment) {
        continue;
      }

      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'user',
          subjectId: userId,
          permissionSetKey: setKey,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
