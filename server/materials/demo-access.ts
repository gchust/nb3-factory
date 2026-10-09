import {
  UserAdministrationError,
  type AdministratedUser,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { PermissionSetSubject } from '@nocobase/authorization/permission-sets';

import {
  MATERIALS_EMPLOYEE_SET,
  MATERIALS_SUPERVISOR_SET,
} from './permission-sets.js';

/**
 * A demonstration account: it is created once and then belongs to the
 * administrator, so startup never resets a password or a profile an
 * administrator has since edited.
 */
export interface DemoAccount {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export const DEMO_SUPERVISOR: DemoAccount = {
  username: 'supervisor',
  name: '主管',
  email: 'supervisor@example.invalid',
  password: 'supervisor123',
};

export const DEMO_COLLEAGUE: DemoAccount = {
  username: 'colleague',
  name: '普通同事',
  email: 'colleague@example.invalid',
  password: 'colleague123',
};

async function findAccount(
  users: UserAdministrationService,
  account: DemoAccount,
): Promise<AdministratedUser | undefined> {
  for (const search of [account.username, account.email]) {
    const page = await users.list({ search, pageSize: 100 });
    const found = page.items.find(
      (user) =>
        user.username === account.username || user.email === account.email,
    );
    if (found) return found;
  }
  return undefined;
}

/** Creates the account only when it is missing; an existing one is left alone. */
async function ensureAccount(
  users: UserAdministrationService,
  account: DemoAccount,
): Promise<AdministratedUser> {
  const existing = await findAccount(users, account);
  if (existing) return existing;
  try {
    return await users.create({
      name: account.name,
      email: account.email,
      username: account.username,
      password: account.password,
    });
  } catch (error) {
    // A concurrent boot may have created it between the read and the write.
    if (
      error instanceof UserAdministrationError &&
      (error.code === 'USER_USERNAME_CONFLICT' ||
        error.code === 'USER_EMAIL_CONFLICT' ||
        error.code === 'USER_IDENTITY_CONFLICT')
    ) {
      const raced = await findAccount(users, account);
      if (raced) return raced;
    }
    throw error;
  }
}

async function ensureAssignment(
  authz: AppAuthorization,
  permissionSet: string,
  subject: PermissionSetSubject,
): Promise<void> {
  const matches = (items: readonly { subject: PermissionSetSubject }[]) =>
    items.some(
      (assignment) =>
        assignment.subject.type === subject.type &&
        assignment.subject.id === subject.id,
    );
  if (matches(await authz.permissionSets.listAssignments(permissionSet)))
    return;
  try {
    await authz.permissionSets.assign({ permissionSet, subject });
  } catch (error) {
    if (matches(await authz.permissionSets.listAssignments(permissionSet)))
      return;
    throw error;
  }
}

/**
 * Gives the demo accounts their materials access, next to the administrator's
 * own configuration.
 *
 * The reader set is assigned to the `authenticated` audience, so every
 * signed-in colleague reads the non-confidential materials; the supervisor set
 * is assigned to the supervisor account, which adds the confidential material
 * and the write actions. Both assignments are existence-checked and created
 * once — a later administrator change to either is preserved.
 */
export async function provisionMaterialsAccess(options: {
  authz: AppAuthorization;
  users: UserAdministrationService;
}): Promise<{ supervisor: AdministratedUser; colleague: AdministratedUser }> {
  const { authz, users } = options;
  await ensureAssignment(authz, MATERIALS_EMPLOYEE_SET, {
    type: 'authenticated',
    id: '*',
  });
  const supervisor = await ensureAccount(users, DEMO_SUPERVISOR);
  const colleague = await ensureAccount(users, DEMO_COLLEAGUE);
  await ensureAssignment(authz, MATERIALS_SUPERVISOR_SET, {
    type: 'user',
    id: supervisor.id,
  });
  return { supervisor, colleague };
}
