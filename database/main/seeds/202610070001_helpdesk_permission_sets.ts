import { defineSeed } from '@nocobase/db';

import {
  employeePermissionSet,
  helpdeskPermissionSets,
} from '../../seed-data/helpdesk-permission-sets.ts';

interface PermissionSetRow {
  id: string;
  key: string;
  title: unknown;
  grants: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface PermissionSetAssignmentRow {
  id: string;
  subjectType: string;
  subjectId: string;
  permissionSetKey: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates the three helpdesk jobs on a fresh installation. Existing sets are
 * left untouched, so a later administrator edit is never overwritten. The
 * employee job is assigned to every signed-in identity; engineering and
 * service-desk assignments need real people and stay an administrator task.
 */
export default defineSeed({
  name: '202610070001_helpdesk_permission_sets',
  transaction: true,
  async run(seed) {
    const sets =
      seed.repository<PermissionSetRow>('authorizationPermissionSets');
    const assignments = seed.repository<PermissionSetAssignmentRow>(
      'authorizationPermissionSetAssignments',
    );
    const now = new Date();

    for (const permissionSet of helpdeskPermissionSets) {
      const existing = await sets.findOne({
        filter: { key: permissionSet.key },
      });
      if (!existing) {
        await sets.createOne({
          values: {
            id: permissionSet.key,
            key: permissionSet.key,
            title: permissionSet.title ?? null,
            grants: permissionSet.grants,
            createdAt: now,
            updatedAt: now,
          } as never,
        });
      }
    }

    const employeeAssignment = await assignments.findOne({
      filter: {
        subjectType: 'authenticated',
        subjectId: '*',
        permissionSetKey: employeePermissionSet.key,
      },
    });
    if (!employeeAssignment) {
      await assignments.createOne({
        values: {
          id: `authenticated:*:${employeePermissionSet.key}`,
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: employeePermissionSet.key,
          createdAt: now,
          updatedAt: now,
        } as never,
      });
    }
  },
});
