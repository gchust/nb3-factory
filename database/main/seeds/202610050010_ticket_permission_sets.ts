import { defineSeed, type SeedContext } from '@nocobase/db';

/**
 * The two work roles of the IT repair desk.
 *
 * A permission set is the unit an administrator assigns in the Users page, so
 * these are how "give a new colleague the same work permissions" is expressed:
 * pick `tickets-employee` for a colleague who files tickets, or
 * `tickets-handler` for someone who works them. Nothing in the application
 * keys off a username — the server reads the caller's effective permission
 * sets, so a colleague the administrator creates tomorrow works exactly like
 * the seeded demo accounts.
 *
 * Each set carries the page grant that lets the holder open `/tickets`. The
 * role distinction itself (who may start and complete work) is enforced per
 * request from these same set keys, not from the menu.
 */

const EMPLOYEE = 'tickets-employee';
const HANDLER = 'tickets-handler';

const TICKETS_PAGE_GRANT = {
  resource: { type: 'page', id: 'tickets' },
  actions: [{ action: 'access' }],
};

async function upsertSet(
  query: SeedContext['query'],
  key: string,
  title: string,
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
      grants: JSON.stringify([TICKETS_PAGE_GRANT]),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

export default defineSeed({
  name: '202610050010_ticket_permission_sets',
  async run({ query }) {
    await upsertSet(query, EMPLOYEE, 'IT 报修员工 / IT Requester');
    await upsertSet(query, HANDLER, 'IT 处理人员 / IT Handler');
  },
});
