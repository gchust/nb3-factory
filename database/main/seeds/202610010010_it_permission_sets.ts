import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import type { PermissionGrant } from '@nocobase/authorization/core';
import { definePermissionSet } from '@nocobase/authorization/permission-sets';
import { defineSeed } from '@nocobase/db';

/**
 * Installs the IT responsibilities as ordinary Permission Sets.
 *
 * This seed is deliberately self-contained. The database task loader imports a
 * seed with native ESM, which does not rewrite a relative `.js` specifier to
 * the `.ts` source, so a seed cannot import another module of this
 * application. The identifiers it repeats are asserted against
 * `server/it/resources.ts` and `server/it/record-access.ts` by
 * `tests/logic/it-permission-sets.test.ts`.
 *
 * It inserts only a set whose key is absent, so an administrator who renames,
 * copies or edits these definitions keeps their change on every later run.
 */

/** The composite resource every IT ticket endpoint authorizes against. */
const IT_TICKETS_RESOURCE = 'it.tickets';
/** The client page id stored in page grants. */
const IT_TICKETS_PAGE = 'it.requests';
/** The record access that selects a user's own submissions. */
const IT_SUBMITTED_BY_ME = 'it.submittedByMe';

export const IT_EMPLOYEE_SET = 'it-employee';
export const IT_HANDLER_SET = 'it-handler';

/** Access to the IT requests page, shared by both responsibilities. */
export const itRequestsPageGrant: PermissionGrant = {
  resource: { type: 'page', id: IT_TICKETS_PAGE },
  actions: [{ action: 'access' }],
};

/** One composite grant whose actions all select the same data scope. */
function itTicketGrant(
  actions: readonly string[],
  scope: string,
): PermissionGrant {
  return {
    resource: { type: 'composite', id: IT_TICKETS_RESOURCE },
    actions: actions.map((action) => ({
      action,
      policy: { type: 'composite', scopes: { tickets: scope } },
    })),
  };
}

/**
 * An employee: sees and submits only their own tickets. No `handle` grant, so
 * the start and complete endpoints answer `403` for this responsibility.
 */
export const itEmployee = definePermissionSet(IT_EMPLOYEE_SET)
  .title({ key: 'it.set.employee', ns: 'nb3-factory' })
  .grant(
    itRequestsPageGrant,
    itTicketGrant(['view', 'create'], IT_SUBMITTED_BY_ME),
  )
  .build();

/**
 * A handler: sees every ticket and may start and complete any of them. The
 * `allRecords` built-in record access is the whole collection.
 */
export const itHandler = definePermissionSet(IT_HANDLER_SET)
  .title({ key: 'it.set.handler', ns: 'nb3-factory' })
  .grant(
    itRequestsPageGrant,
    itTicketGrant(['view', 'create', 'handle'], 'allRecords'),
  )
  .build();

export const itPermissionSets = [itEmployee, itHandler] as const;

export default defineSeed({
  name: '202610010010_it_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const set of itPermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
