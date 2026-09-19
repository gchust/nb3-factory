import type { AppAuthorization } from '@nocobase/app-plugin-authorization';

import type { RentalRole } from './rental-service.js';

/**
 * A signed-in user is a manager when they hold the protected
 * `system-administrator` role or the application's `rental-manager` role.
 * Every other signed-in account is staff and only manages its own bookings.
 */
const MANAGER_PERMISSION_SETS = new Set([
  'system-administrator',
  'rental-manager',
]);

export async function resolveRentalRole(
  authorization: AppAuthorization | undefined,
  userId: string,
): Promise<RentalRole> {
  if (!authorization) return 'staff';
  const sets = await authorization.permissionSets.getEffective({
    principal: { type: 'user', id: userId },
    subjects: [{ type: 'authenticated', id: '*' }],
  });
  return sets.some((set) => MANAGER_PERMISSION_SETS.has(set.key))
    ? 'manager'
    : 'staff';
}
