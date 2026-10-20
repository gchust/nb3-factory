import { definePermissionSet } from '@nocobase/authorization';
import { defineSeed } from '@nocobase/db';

const KEY = 'leave-approver';
const NAMESPACE = 'nb3-factory';

/**
 * The permission set an administrator assigns to a manager who may decide leave
 * requests. It carries no page grant: the leave page is open to every signed-in
 * person, and the server checks `leave.approvals` `decide` on the decision route.
 *
 * The seed creates the set only when it is absent, so an administrator's later
 * edit to its title or grants is never overwritten.
 */
export default defineSeed({
  name: '202610260002_create_leave_approver_set',

  run: async (context) => {
    const permissionSets = context.repository('authorizationPermissionSets');
    const existing = await permissionSets.findOne({
      filter: { key: KEY },
    });
    if (existing) return;

    const definition = definePermissionSet(KEY)
      .title({
        key: 'leave.permissions.approverSet',
        ns: NAMESPACE,
      })
      .grant({
        resource: { type: 'settings', id: 'leave.approvals' },
        actions: [{ action: 'decide' }],
      })
      .build();
    const now = new Date();
    await permissionSets.createOne({
      values: {
        id: crypto.randomUUID(),
        key: definition.key,
        title: definition.title,
        grants: definition.grants,
        createdAt: now,
        updatedAt: now,
      },
    });
  },
});
