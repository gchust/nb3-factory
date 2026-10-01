import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import {
  ROLE_KEYS,
  ROOT_PERMISSION_SET,
  ServiceError,
  forbidden,
  type BusinessRole,
  type ServiceActor,
} from './contracts.js';

/**
 * Resolves the business role of a signed-in user and owns every role check the
 * application makes.
 *
 * Roles are the application's own Permission Sets, so they are the same facts
 * an administrator sees and edits in the authorization UI — the service layer
 * reads the real assignments rather than a copy.
 */
export class AccessService {
  private readonly authorization: AppAuthorization;

  constructor(authorization: AppAuthorization) {
    this.authorization = authorization;
  }

  async resolveActor(userId: string): Promise<ServiceActor> {
    const assignments =
      await this.authorization.permissionSets.listAssignments();
    const roleKeys = assignments
      .filter(
        (assignment) =>
          assignment.subject.type === 'user' &&
          assignment.subject.id === userId,
      )
      .map((assignment) => assignment.permissionSet);
    const isRoot = roleKeys.includes(ROOT_PERMISSION_SET);
    return {
      id: userId,
      roleKeys,
      isRoot,
      isSupervisor: isRoot || roleKeys.includes(ROLE_KEYS.supervisor),
      isEngineer: roleKeys.includes(ROLE_KEYS.engineer),
      isObserver: roleKeys.includes(ROLE_KEYS.observer),
      isIntegration: roleKeys.includes(ROLE_KEYS.integration),
    };
  }

  /** Everyone assigned a given business Permission Set, used to address messages. */
  async listUserIdsByRole(role: BusinessRole): Promise<string[]> {
    const assignments =
      await this.authorization.permissionSets.listAssignments();
    const key = ROLE_KEYS[role];
    return assignments
      .filter((assignment) => assignment.permissionSet === key)
      .map((assignment) => assignment.subject.id);
  }

  /** Who may read the customer and device ledgers. */
  assertCanReadLedger(actor: ServiceActor): void {
    if (actor.isRoot || actor.isSupervisor || actor.isEngineer) {
      return;
    }
    throw forbidden(
      'Only service staff may read the customer and device ledgers.',
    );
  }

  /** Who may change customers, devices, knowledge and other configuration. */
  assertSupervisor(actor: ServiceActor): void {
    if (actor.isRoot || actor.isSupervisor) {
      return;
    }
    throw forbidden('This operation is limited to the service supervisor.');
  }

  /** Who may process a ticket. */
  assertStaff(actor: ServiceActor): void {
    if (actor.isRoot || actor.isSupervisor || actor.isEngineer) {
      return;
    }
    throw forbidden('This operation is limited to service staff.');
  }

  assertCanReadTickets(actor: ServiceActor): void {
    if (
      actor.isRoot ||
      actor.isSupervisor ||
      actor.isEngineer ||
      actor.isObserver ||
      actor.isIntegration
    ) {
      return;
    }
    throw forbidden('You may not read service tickets.');
  }

  /** Anyone signed in may use published knowledge; drafts stay with the supervisor. */
  assertCanReadKnowledge(actor: ServiceActor): void {
    this.assertCanReadLedger(actor);
  }

  isSupervisorOnlyArticle(actor: ServiceActor, published: boolean): boolean {
    return !published && !(actor.isRoot || actor.isSupervisor);
  }

  /** Ticket families an engineer is allowed to touch; throws the right refusal. */
  assertEngineerMayReadTicket(
    actor: ServiceActor,
    ticket: { assigneeId?: string | null },
    shared: boolean,
  ): void {
    if (actor.isRoot || actor.isSupervisor) {
      return;
    }
    if (actor.isEngineer && (ticket.assigneeId === actor.id || shared)) {
      return;
    }
    throw forbidden(
      'You may only read tickets assigned to you or explicitly shared with you.',
    );
  }

  assertMayProcessTicket(
    actor: ServiceActor,
    ticket: { assigneeId?: string | null; confidential?: boolean },
  ): void {
    if (actor.isRoot || actor.isSupervisor) {
      return;
    }
    if (actor.isEngineer && ticket.assigneeId === actor.id) {
      return;
    }
    throw forbidden('Only the assigned engineer may process this ticket.');
  }

  assertMayDecideTicket(actor: ServiceActor): void {
    this.assertSupervisor(actor);
  }
}

export function assertActorPresent(
  actor: ServiceActor | undefined,
): ServiceActor {
  if (!actor) {
    throw new ServiceError('UNAUTHENTICATED', 'Sign in to continue.', 401);
  }
  return actor;
}
