import { defineSeed } from '@nocobase/db';

interface GrantAction {
  action: string;
  policy?: unknown;
}

interface Grant {
  resource: { type: string; id: string };
  actions: GrantAction[];
}

const TEAM_PAGE = { type: 'page', id: 'it.team' } as const;
const USERS = { type: 'user', id: '*' } as const;
const TICKETS = { type: 'composite', id: 'it.tickets' } as const;

function mergeActions(
  grants: Grant[],
  resource: { type: string; id: string },
  actions: readonly GrantAction[],
): void {
  let grant = grants.find(
    (candidate) =>
      candidate.resource.type === resource.type &&
      candidate.resource.id === resource.id,
  );
  if (!grant) {
    grant = { resource: { ...resource }, actions: [] };
    grants.push(grant);
  }
  for (const action of actions) {
    if (
      !grant.actions.some((candidate) => candidate.action === action.action)
    ) {
      grant.actions.push(action);
    }
  }
}

/**
 * Extends the service desk set with the surfaces it needs to run the service:
 * the team page, the user actions its API checks, and the demonstration-data
 * action. The grants are merged rather than replaced, so an administrator's
 * own changes to the set survive this seed.
 */
export default defineSeed({
  name: '202610070004_it_team_access',
  transaction: true,
  async run({ query }) {
    const set = await query
      .selectFrom('authorizationPermissionSets')
      .select(['grants'])
      .where('key', '=', 'it-service-desk')
      .executeTakeFirst();
    if (!set) return;

    const grants = JSON.parse(String(set.grants)) as Grant[];
    mergeActions(grants, TEAM_PAGE, [{ action: 'access' }]);
    mergeActions(grants, USERS, [
      { action: 'read' },
      { action: 'create' },
      { action: 'assign-role' },
    ]);
    mergeActions(grants, TICKETS, [
      {
        action: 'manage',
        policy: { type: 'composite', scopes: { ticket: 'allRecords' } },
      },
    ]);

    await query
      .updateTable('authorizationPermissionSets')
      .set({ grants: JSON.stringify(grants), updatedAt: new Date() })
      .where('key', '=', 'it-service-desk')
      .execute();
  },
});
