import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';

/**
 * Business roles are Permission Sets, not a second roles table. The
 * provisioning step creates these sets and assigns the demonstration accounts;
 * `ServiceAccess` reads the assignment the authorization service already
 * holds, so revoking a role also removes the person from routing.
 */
export const ROLE_PERMISSION_SETS = {
  supervisor: 'service-supervisor',
  engineer: 'service-engineer',
  observer: 'service-observer',
  integration: 'service-integration',
} as const;

export type ServiceRole = keyof typeof ROLE_PERMISSION_SETS;

export interface ServiceActor {
  readonly id: string;
  readonly roles: ReadonlySet<ServiceRole>;
  /** Root or another set that confers unrestricted access. */
  readonly unrestricted: boolean;
}

export function hasRole(actor: ServiceActor, role: ServiceRole): boolean {
  return actor.unrestricted || actor.roles.has(role);
}

export function isManager(actor: ServiceActor): boolean {
  return hasRole(actor, 'supervisor');
}

export class ServiceAccess {
  constructor(private readonly authz: AppAuthorization) {}

  async actor(userId: string): Promise<ServiceActor> {
    if (!userId) throw new Error('ServiceAccess requires a user id');
    const sets = await this.authz.permissionSets.getEffective({
      principal: { type: 'user', id: userId },
    });
    const roles = new Set<ServiceRole>();
    for (const set of sets) {
      for (const [role, key] of Object.entries(ROLE_PERMISSION_SETS)) {
        if (set.key === key) roles.add(role as ServiceRole);
      }
    }
    return {
      id: userId,
      roles,
      unrestricted: this.isUnrestricted(sets),
    };
  }

  async actorFromContext(
    userId: string,
    authz: AuthorizationContext,
  ): Promise<ServiceActor> {
    const snapshot = await authz.snapshot();
    const actor = await this.actor(userId);
    return snapshot.unrestricted ? { ...actor, unrestricted: true } : actor;
  }

  private isUnrestricted(sets: readonly { key: string }[]): boolean {
    return sets.some((set) => {
      const protection = this.authz.permissionSets.protection(set.key);
      return protection?.unrestricted === true;
    });
  }
}
