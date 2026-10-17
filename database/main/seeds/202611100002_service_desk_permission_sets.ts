import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';

// Kept self-contained: a seed runs without the application runtime, and its
// grants are the persisted shape rather than a live resource declaration.
const ns = 'nb3-factory';
const pageGrant = {
  resource: { type: 'page', id: 'service-desk' },
  actions: [{ action: 'access' }],
};
const usersPageGrant = {
  resource: { type: 'page', id: 'service-desk.users' },
  actions: [{ action: 'access' }],
};
// User management checks `user` as a record type. A service desk manager may
// list accounts and change their business roles, and nothing else.
const userAdminGrant = {
  resource: { type: 'user', id: '*' },
  actions: [{ action: 'read' }, { action: 'assign-role' }],
};

function ticketGrant(
  scopes: Readonly<Record<string, string>>,
  actions: readonly string[],
) {
  return {
    resource: { type: 'composite', id: 'serviceDesk.tickets' },
    actions: actions.map((action) => ({
      action,
      policy: { type: 'composite', scopes },
    })),
  };
}

const employee = {
  key: 'service-desk-employee',
  title: { key: 'serviceDesk.permissionSets.employee', ns },
  grants: [
    pageGrant,
    ticketGrant(
      {
        tickets: 'serviceDesk.requesterTickets',
        comments: 'serviceDesk.requesterComments',
      },
      ['view'],
    ),
    ticketGrant({ tickets: 'allRecords', comments: 'allRecords' }, ['create']),
    ticketGrant(
      { tickets: 'serviceDesk.requesterTickets', comments: 'allRecords' },
      ['comment', 'confirm', 'reopen'],
    ),
  ],
};

const engineer = {
  key: 'service-desk-engineer',
  title: { key: 'serviceDesk.permissionSets.engineer', ns },
  grants: [
    pageGrant,
    ticketGrant(
      {
        tickets: 'serviceDesk.assigneeTickets',
        comments: 'serviceDesk.assigneeComments',
      },
      ['view'],
    ),
    ticketGrant(
      { tickets: 'serviceDesk.assigneeTickets', comments: 'allRecords' },
      ['comment', 'resolve'],
    ),
  ],
};

const manager = {
  key: 'service-desk-manager',
  title: { key: 'serviceDesk.permissionSets.manager', ns },
  grants: [
    pageGrant,
    usersPageGrant,
    userAdminGrant,
    ticketGrant({ tickets: 'allRecords', comments: 'allRecords' }, [
      'view',
      'create',
      'assign',
      'comment',
      'resolve',
      'confirm',
      'reopen',
    ]),
  ],
};

const serviceDeskPermissionSets = [employee, engineer, manager] as const;

export default defineSeed({
  name: '202611100002_service_desk_permission_sets',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const permissionSet of serviceDeskPermissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: permissionSet.key,
          key: permissionSet.key,
          title: encodeAuthorizationTitle(permissionSet.title),
          grants: JSON.stringify(permissionSet.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
