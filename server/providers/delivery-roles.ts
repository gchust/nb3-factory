import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  DELIVERY_MANAGER_ROLE,
  DELIVERY_MEMBER_ROLE,
  classifyDeliveryRole,
} from './delivery-rules.js';
import type { DeliveryActor } from './delivery-service.js';

/**
 * Pages a project member may open. A newly registered account inherits the
 * project-member role, so these grants are what let a member reach the
 * delivery pages (and the homepage) at all.
 */
export const DELIVERY_PAGE_IDS = [
  'delivery-dashboard',
  'delivery-projects',
  'delivery-milestones',
  'delivery-tasks',
  'delivery-timesheets',
] as const;

function deliveryPageGrants() {
  return DELIVERY_PAGE_IDS.map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));
}

type PermissionSetsApi = AppAuthorization['permissionSets'];

/**
 * Creates the two delivery roles when missing and makes every signed-in
 * account a project member. Idempotent: existing roles and assignments are
 * left untouched so administrator edits survive a restart.
 */
export async function ensureDeliveryRoles(
  permissionSets: PermissionSetsApi,
): Promise<void> {
  const existing = await permissionSets.list();
  const keys = new Set(existing.map((set) => set.key));
  if (!keys.has(DELIVERY_MEMBER_ROLE)) {
    await permissionSets.create({
      key: DELIVERY_MEMBER_ROLE,
      title: 'Project member',
      grants: deliveryPageGrants(),
    });
  }
  if (!keys.has(DELIVERY_MANAGER_ROLE)) {
    await permissionSets.create({
      key: DELIVERY_MANAGER_ROLE,
      title: 'Project manager',
      grants: deliveryPageGrants(),
    });
  }
  const assignments =
    await permissionSets.listAssignments(DELIVERY_MEMBER_ROLE);
  const hasAuthenticatedDefault = assignments.some(
    (assignment) =>
      assignment.subject.type === 'authenticated' &&
      assignment.subject.id === '*',
  );
  if (!hasAuthenticatedDefault) {
    await permissionSets.assign({
      subject: { type: 'authenticated', id: '*' },
      permissionSet: DELIVERY_MEMBER_ROLE,
    });
  }
}

export async function resolveDeliveryActor(
  permissionSets: PermissionSetsApi,
  userId: string,
): Promise<DeliveryActor> {
  const effective = await permissionSets.getEffective({
    principal: { type: 'user', id: userId },
    subjects: [{ type: 'authenticated', id: '*' }],
  });
  return {
    userId,
    role: classifyDeliveryRole(effective.map((set) => set.key)),
  };
}

export default class DeliveryRolesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/delivery-roles';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    const authorization = this.app.container.resolve(authorizationToken);
    await ensureDeliveryRoles(authorization.permissionSets);
  }
}
