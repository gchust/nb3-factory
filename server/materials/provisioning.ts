import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import type { PermissionSetsApi } from '@nocobase/app-plugin-authorization/server';

import { MATERIALS_MANAGER_SET, MATERIALS_STAFF_SET } from './resources.js';

export interface TestAccount {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly permissionSet: string;
}

/**
 * The two isolated sample identities the specification describes: a supervisor
 * who maintains materials, and an ordinary colleague who may only read the
 * non-confidential ones.
 *
 * These are development/sample accounts. Their passwords are documented in
 * `README.MD`; an administrator can change them from the Users page at any
 * time, and provisioning never resets an account that already exists.
 */
export const TEST_ACCOUNTS: readonly TestAccount[] = [
  {
    username: 'supervisor',
    name: '资料主管',
    email: 'supervisor@example.com',
    password: 'Supervisor123!',
    permissionSet: MATERIALS_MANAGER_SET,
  },
  {
    username: 'colleague',
    name: '普通同事',
    email: 'colleague@example.com',
    password: 'Colleague123!',
    permissionSet: MATERIALS_STAFF_SET,
  },
];

/**
 * Creates the sample accounts that do not exist yet and gives only those the
 * matching Permission Set. An account an administrator already created is left
 * exactly as it is, so re-running a boot never re-adds a revoked assignment.
 */
export async function provisionTestAccounts(
  users: UserAdministrationService,
  permissionSets: PermissionSetsApi,
): Promise<void> {
  for (const account of TEST_ACCOUNTS) {
    const page = await users.list({
      search: account.username,
      pageSize: 50,
    });
    const existing = page.items.find(
      (item) => item.username === account.username,
    );
    if (existing) {
      continue;
    }
    const created = await users.create({
      name: account.name,
      username: account.username,
      email: account.email,
      password: account.password,
    });
    // A boot that runs before the permission-set seed (or an installation
    // where it failed) still creates the account; the assignment is retried on
    // the next boot rather than preventing startup.
    if (!(await permissionSets.get(account.permissionSet))) {
      continue;
    }
    await permissionSets.assign({
      subject: { type: 'user', id: created.id },
      permissionSet: account.permissionSet,
    });
  }
}
