import { defineSeed, type QueryAdapter } from '@nocobase/db';

/**
 * The two Permission Sets of the IT support feature.
 *
 * An employee may open the page, see the tickets they submitted and submit a
 * new one. A handler reaches every ticket and may start and resolve it. The
 * data scopes are stored as record access keys, so an administrator can adjust
 * them later without a code change; the composite itself is declared in
 * `server/tickets/resources.ts`.
 */

const EMPLOYEE_SET = 'it-support-employee';
const HANDLER_SET = 'it-support-handler';

const PAGE_GRANT = {
  resource: { type: 'page', id: 'it.tickets' },
  actions: [{ action: 'access' }],
};

const RECORD_ACCESS = (key: string) => ({
  type: 'recordAccess',
  key,
});

const COMPOSITE_ACTIONS = (
  scopes: Record<string, unknown>,
  actions: readonly string[],
) => ({
  resource: { type: 'composite', id: 'it.tickets' },
  actions: actions.map((action) => ({
    action,
    policy: { type: 'composite', scopes: { tickets: scopes.tickets } },
  })),
});

const EMPLOYEE_GRANTS = [
  PAGE_GRANT,
  // `create` is bound to the same record scope as `view`: the insert's record
  // scope is unrestricted, but reading the new row back must reach the
  // submitter's own ticket and nothing else.
  COMPOSITE_ACTIONS({ tickets: RECORD_ACCESS('it.ownsTickets') }, [
    'view',
    'create',
  ]),
];

const HANDLER_GRANTS = [
  PAGE_GRANT,
  COMPOSITE_ACTIONS({ tickets: 'allRecords' }, [
    'view',
    'create',
    'start',
    'complete',
  ]),
];

async function ensureSet(
  query: QueryAdapter,
  key: string,
  title: string,
  grants: unknown,
): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst();
  if (existing) {
    return;
  }

  const now = new Date();
  await query
    .insertInto('authorizationPermissionSets')
    .values({
      id: crypto.randomUUID(),
      key,
      title: JSON.stringify(title),
      grants: JSON.stringify(grants),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

export default defineSeed({
  name: '202609300001_create_ticket_permission_sets',
  async run({ query }) {
    await ensureSet(
      query,
      EMPLOYEE_SET,
      'IT Support Employee',
      EMPLOYEE_GRANTS,
    );
    await ensureSet(query, HANDLER_SET, 'IT Support Handler', HANDLER_GRANTS);
  },
});
