import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

const NS = 'nb3-factory';
const title = (key: string) => ({ key, ns: NS });
const page = (id: string) => ({
  resource: { type: 'page' as const, id },
  actions: [{ action: 'access' }],
});
const settings = (id: string, actions: readonly string[]) => ({
  resource: { type: 'settings' as const, id },
  actions: actions.map((action) => ({ action })),
});
const scope = (name: string) => ({
  policy: { type: 'composite' as const, scopes: { helpdeskTickets: name } },
});
const granted = (
  id: string,
  actions: readonly { action: string; scope?: string }[],
) => ({
  resource: { type: 'composite' as const, id },
  actions: actions.map(({ action, scope: name }) => ({
    action,
    ...(name ? scope(name) : {}),
  })),
});

/**
 * The permission sets are inlined so this seed is runnable before the
 * application has been compiled. A relative import of application source would
 * point at a `.js` file that does not exist yet in the source tree.
 */
const permissionSets = [
  {
    key: 'helpdesk-employee',
    title: title('helpdesk.permissionSets.employee'),
    grants: [
      page('helpdesk.tickets'),
      granted('helpdesk.tickets', [
        { action: 'view', scope: 'helpdesk.ownTickets' },
        { action: 'create', scope: 'helpdesk.allTickets' },
        { action: 'confirm', scope: 'helpdesk.ownTickets' },
        { action: 'return', scope: 'helpdesk.ownTickets' },
      ]),
    ],
  },
  {
    key: 'helpdesk-engineer',
    title: title('helpdesk.permissionSets.engineer'),
    grants: [
      page('helpdesk.tickets'),
      granted('helpdesk.tickets', [
        { action: 'view', scope: 'helpdesk.assignedTickets' },
        { action: 'progress', scope: 'helpdesk.assignedTickets' },
        { action: 'resolve', scope: 'helpdesk.assignedTickets' },
      ]),
    ],
  },
  {
    key: 'helpdesk-service-desk',
    title: title('helpdesk.permissionSets.serviceDesk'),
    grants: [
      page('helpdesk.dashboard'),
      page('helpdesk.tickets'),
      settings('helpdesk.workflow', ['read']),
      settings('helpdesk.reminders', ['read', 'update']),
      granted('helpdesk.dashboard', [{ action: 'view' }]),
      granted('helpdesk.tickets', [
        { action: 'view', scope: 'helpdesk.allTickets' },
        { action: 'create', scope: 'helpdesk.allTickets' },
        { action: 'assign', scope: 'helpdesk.allTickets' },
        { action: 'progress', scope: 'helpdesk.allTickets' },
        { action: 'resolve', scope: 'helpdesk.allTickets' },
      ]),
    ],
  },
] as const;

/**
 * Installs the initial job permission sets. Permission sets are ordinary
 * editable configuration after this: the seed never overwrites a set an
 * administrator has changed, and never assigns one to a person automatically.
 */
export default defineSeed({
  name: '202611010001_helpdesk_permissions',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    for (const permissionSet of permissionSets) {
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
