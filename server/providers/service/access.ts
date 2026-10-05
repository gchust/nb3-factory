import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager, RepositoryRecord } from '@nocobase/db';

import { forbidden, unauthorized } from './errors.js';
import { SERVICE_PERMISSION_SETS } from './tokens.js';
import type { ServiceActor, ServiceRole } from './types.js';
import { num, str } from './types.js';

/**
 * The permission sets this application maintains are the single source of the
 * business role. They are ordinary Permission Sets managed through the
 * registered authorization management UI, so an administrator can rename,
 * re-grant or re-assign them without touching code.
 */
const ROLE_BY_PERMISSION_SET: Readonly<Record<string, ServiceRole>> = {
  [SERVICE_PERMISSION_SETS.manager]: 'manager',
  [SERVICE_PERMISSION_SETS.engineer]: 'engineer',
  [SERVICE_PERMISSION_SETS.observer]: 'observer',
  [SERVICE_PERMISSION_SETS.integrator]: 'integrator',
};

/** The seat kind of an engineer member, used when no permission set is assigned. */
const ROLE_BY_SEAT_KIND: Readonly<Record<string, ServiceRole>> = {
  manager: 'manager',
  engineer: 'engineer',
  observer: 'observer',
  integrator: 'integrator',
};

export interface ServiceUser {
  readonly id: string;
  readonly name?: unknown;
  readonly email?: unknown;
}

export interface ServiceAccessOptions {
  readonly database: DatabaseManager;
  readonly authorization?: AppAuthorization | undefined;
}

/**
 * Resolves the caller to a business actor and answers the three questions the
 * domain asks about one:
 *
 * 1. which business role the account holds,
 * 2. whether a page capability is granted (`page:access`), and
 * 3. which work order ids the account may read through a temporary share.
 *
 * Record-level visibility is the only thing layered on top of the roles; every
 * business action capability is decided here rather than in a second,
 * parallel permission system.
 */
export class ServiceAccess {
  constructor(private readonly options: ServiceAccessOptions) {}

  private get authorization(): AppAuthorization | undefined {
    return this.options.authorization;
  }

  /** Resolves the signed-in user into a domain actor. */
  async resolveActor(
    user: ServiceUser | undefined | null,
  ): Promise<ServiceActor> {
    if (!user || !user.id) {
      throw unauthorized('Authentication is required.');
    }
    const userId = String(user.id);
    const [{ roles }, member] = await Promise.all([
      this.resolveRoles(userId),
      this.findMember(userId),
    ]);
    return {
      userId,
      name: str(user.name),
      email: str(user.email),
      roles,
      memberId: member ? num(member.id) : null,
      memberGroupId: member ? num(member.groupId) : null,
    };
  }

  private async resolveRoles(
    userId: string,
  ): Promise<{ roles: readonly ServiceRole[]; unrestricted: boolean }> {
    const authorization = this.authorization;
    if (!authorization) return { roles: [], unrestricted: false };
    const identity = { principal: { type: 'user', id: userId } };
    const snapshot = await authorization.for(identity).snapshot();
    if (snapshot.unrestricted) {
      return { roles: ['manager'], unrestricted: true };
    }
    const effective = await authorization.permissionSets.getEffective({
      principal: identity.principal,
    });
    const roles: ServiceRole[] = [];
    for (const set of effective) {
      const role = ROLE_BY_PERMISSION_SET[set.key];
      if (role && !roles.includes(role)) roles.push(role);
    }
    return { roles, unrestricted: false };
  }

  /**
   * The engineer seat the account is linked to. A seat is the durable
   * assignment target, so work orders keep pointing at it when a person is
   * replaced; the account link is what turns a seat into a signed-in actor.
   */
  async findMember(userId: string): Promise<RepositoryRecord | null> {
    const repository = this.options.database.repository(
      'serviceEngineerMembers',
    );
    const record = await repository.findOne({
      filter: (filter) => filter.string('userId').eq(userId),
    });
    return record ?? null;
  }

  /** Work order ids an engineer may additionally read through a temporary share. */
  async sharedWorkOrderIds(
    memberId: number | null,
  ): Promise<readonly number[]> {
    if (!memberId) return [];
    const repository = this.options.database.repository(
      'serviceWorkOrderShares',
    );
    const rows = await repository.findMany({
      filter: (filter) =>
        filter.and([
          filter.number('engineerMemberId').eq(memberId),
          filter.date('revokedAt').empty(),
        ]),
      sort: (sort) => sort.field('createdAt').desc(),
      limit: 200,
    });
    return rows
      .map((row) => num(row.workOrderId))
      .filter((id): id is number => id !== null);
  }

  hasRole(actor: ServiceActor, ...roles: readonly ServiceRole[]): boolean {
    return roles.some((role) => actor.roles.includes(role));
  }

  /** Reads the seat kind, used only to bootstrap an actor that has no set yet. */
  async seatRole(actor: ServiceActor): Promise<ServiceRole | null> {
    if (actor.memberId === null) return null;
    const repository = this.options.database.repository(
      'serviceEngineerMembers',
    );
    const record = await repository.findOne({ filter: { id: actor.memberId } });
    if (!record) return null;
    const kind = str(record.kind);
    return ROLE_BY_SEAT_KIND[kind] ?? null;
  }

  isManager(actor: ServiceActor): boolean {
    return actor.roles.includes('manager');
  }

  /**
   * Evaluates a page capability through the registered authorization plugin.
   * No authorization plugin configured means the application has no page
   * grants at all, so nothing is gated here.
   */
  async canPage(actor: ServiceActor, pageId: string): Promise<boolean> {
    const authorization = this.authorization;
    if (!authorization) return true;
    return authorization
      .for({ principal: { type: 'user', id: actor.userId } })
      .can({
        resource: { type: 'page', id: pageId },
        action: 'access',
      });
  }

  /**
   * Requires a page capability. This is what makes "no read action means no
   * access even when the article is published" a real server rule rather than
   * a menu that happens to be hidden.
   */
  async requirePage(
    actor: ServiceActor,
    pageId: string,
    operation: string,
  ): Promise<void> {
    if (this.isManager(actor)) return;
    if (await this.canPage(actor, pageId)) return;
    throw forbidden(`Not permitted to ${operation}.`);
  }

  requireRole(
    actor: ServiceActor,
    operation: string,
    ...roles: readonly ServiceRole[]
  ): void {
    if (roles.length === 0) return;
    if (this.hasRole(actor, ...roles)) return;
    throw forbidden(`Not permitted to ${operation}.`);
  }
}
