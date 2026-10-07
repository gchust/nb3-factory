import type {
  UserRoleOption,
  UserRoleScope,
  UserRoleValue,
} from '@nocobase/app-plugin-users/server/tokens';
import { UserRoleScopeError } from '@nocobase/app-plugin-users/server/tokens';
import type { DatabaseConnection } from '@nocobase/db';

import { assignableRoles } from './roles.js';

/**
 * The application-owned role scope Users renders on its management page.
 *
 * The Users plugin owns the page, the management API and the assignment transaction; this
 * scope only owns what an IT helpdesk role *is* and where it is stored. Registering it is
 * what lets an administrator set `engineer` or `serviceDesk` from the Users page instead
 * of editing the `helpdeskProfiles` table by hand. `admin` is intentionally absent: the
 * overseer role is derived from the authorization plugin's root permission set, and a
 * profile row is not how it is granted.
 */
export const HELPDESK_ROLE_SCOPE_KEY = 'helpdesk';

/** Human-readable labels for the roles the scope can assign. */
const ROLE_LABELS: Readonly<Record<string, string>> = {
  employee: 'Employee',
  engineer: 'Engineer',
  serviceDesk: 'Service desk',
};

/** A label the client translates through this application's own locale namespace. */
const CLIENT_NAMESPACE = 'nb3-factory';

export function createHelpdeskRoleScope(): UserRoleScope {
  return {
    key: HELPDESK_ROLE_SCOPE_KEY,
    label: 'IT helpdesk role',
    labelI18nKey: 'helpdesk.role.scope',
    labelI18nNs: CLIENT_NAMESPACE,
    selection: 'single',
    requiredOnCreate: false,
    options(): Promise<readonly UserRoleOption[]> {
      return Promise.resolve(
        assignableRoles.map((role) => ({
          value: role,
          label: ROLE_LABELS[role] ?? role,
          labelI18nKey: `helpdesk.role.${role}`,
          labelI18nNs: CLIENT_NAMESPACE,
        })),
      );
    },
    async get(userId, connection): Promise<UserRoleValue> {
      const row = await connection.query
        .selectFrom('helpdeskProfiles')
        .select('role')
        .where('userId', '=', userId)
        .executeTakeFirst<{ role: string }>();
      return row?.role ?? '';
    },
    async getMany(userIds, connection) {
      if (!userIds.length) return {};
      const rows = await connection.query
        .selectFrom('helpdeskProfiles')
        .select(['userId', 'role'])
        .where('userId', 'in', [...userIds])
        .execute<{ userId: string; role: string }>();
      const byUser = new Map(rows.map((row) => [row.userId, row.role]));
      return Object.fromEntries(
        userIds.map((userId) => [userId, byUser.get(userId) ?? '']),
      );
    },
    async findUserIds(role, connection): Promise<readonly string[]> {
      requireAssignable(role);
      const rows = await connection.query
        .selectFrom('helpdeskProfiles')
        .select('userId')
        .where('role', '=', role)
        .execute<{ userId: string }>();
      return rows.map((row) => row.userId);
    },
    async replace(userId, value, connection): Promise<void> {
      const role = singleRole(value);
      if (role === '') {
        await connection.query
          .deleteFrom('helpdeskProfiles')
          .where('userId', '=', userId)
          .execute();
        return;
      }
      requireAssignable(role);
      const existing = await connection.query
        .selectFrom('helpdeskProfiles')
        .select('id')
        .where('userId', '=', userId)
        .executeTakeFirst<{ id: number }>();
      if (existing) {
        await connection.query
          .updateTable('helpdeskProfiles')
          .set({ role, updatedAt: new Date() })
          .where('userId', '=', userId)
          .execute();
        return;
      }
      await connection.query
        .insertInto('helpdeskProfiles')
        .values({
          userId,
          role,
          displayName: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
    },
    async onDelete(userId, connection): Promise<void> {
      await connection.query
        .deleteFrom('helpdeskProfiles')
        .where('userId', '=', userId)
        .execute();
    },
  };
}

function requireAssignable(role: string): void {
  if (!(assignableRoles as readonly string[]).includes(role)) {
    throw new UserRoleScopeError(
      'INVALID_ROLE_SCOPE_VALUE',
      `Unknown IT helpdesk role: ${role}`,
      400,
    );
  }
}

function singleRole(value: UserRoleValue): string {
  if (typeof value !== 'string') {
    throw new UserRoleScopeError(
      'INVALID_ROLE_SCOPE_VALUE',
      'The IT helpdesk role scope accepts a single role.',
      400,
    );
  }
  return value.trim();
}

/** Exposed for tests that need to read a stored role without going through Users. */
export async function readHelpdeskRole(
  connection: DatabaseConnection,
  userId: string,
): Promise<string> {
  const row = await connection.query
    .selectFrom('helpdeskProfiles')
    .select('role')
    .where('userId', '=', userId)
    .executeTakeFirst<{ role: string }>();
  return row?.role ?? '';
}
