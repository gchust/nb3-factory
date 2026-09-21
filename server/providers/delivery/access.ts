import type { QueryAdapter } from '@nocobase/db';

import { isRole, type Role } from './constants.js';

export interface Actor {
  readonly userId: string;
  readonly name: string;
  readonly roles: ReadonlySet<Role>;
}

export interface ContractScope {
  /** The actor may read every contract (business lead and finance). */
  readonly readAll: boolean;
  /** The actor may modify every contract (business lead only). */
  readonly manageAll: boolean;
  readonly readableContractIds: ReadonlySet<number>;
  /** Contracts the actor owns as project manager. */
  readonly managedContractIds: ReadonlySet<number>;
  /** Milestones the actor is the assigned acceptance specialist for. */
  readonly acceptedMilestoneIds: ReadonlySet<number>;
}

const EMPTY_SCOPE: ContractScope = {
  readAll: false,
  manageAll: false,
  readableContractIds: new Set(),
  managedContractIds: new Set(),
  acceptedMilestoneIds: new Set(),
};

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

/** Load the roles a user holds from the application's own role table. */
export async function resolveActor(
  query: QueryAdapter,
  userId: string,
  name: string,
): Promise<Actor> {
  const rows = await query
    .selectFrom('deliveryRoleAssignments')
    .select('role')
    .where('userId', '=', userId)
    .execute();
  const roles = new Set<Role>();
  for (const row of rows) {
    const role = (row as { role?: unknown }).role;
    if (isRole(role)) roles.add(role);
  }
  return { userId, name, roles };
}

export function isUnrestricted(actor: Actor): boolean {
  return actor.roles.has('lead');
}

/**
 * Resolve which contracts, and which acceptance assignments, an actor may
 * reach. Everything the API returns is narrowed by this scope; nothing is
 * filtered after the fact in the browser.
 */
export async function resolveContractScope(
  query: QueryAdapter,
  actor: Actor,
): Promise<ContractScope> {
  const { userId, roles } = actor;
  if (roles.has('lead')) {
    return { ...EMPTY_SCOPE, readAll: true, manageAll: true };
  }
  if (roles.has('finance')) {
    return { ...EMPTY_SCOPE, readAll: true };
  }

  const managed = new Set<number>();
  const readable = new Set<number>();
  const accepted = new Set<number>();

  const managedRows = await query
    .selectFrom('deliveryProjects')
    .select('id')
    .where('managerId', '=', userId)
    .execute();
  for (const row of managedRows)
    managed.add(toNumber((row as { id: unknown }).id));

  const memberRows = await query
    .selectFrom('deliveryProjectMembers')
    .select('projectId')
    .where('userId', '=', userId)
    .execute();
  for (const row of memberRows) {
    readable.add(toNumber((row as { projectId: unknown }).projectId));
  }

  const milestoneRows = await query
    .selectFrom('deliveryMilestones')
    .select(['id', 'projectId', 'acceptorId', 'ownerId'])
    .where('acceptorId', '=', userId)
    .execute();
  for (const row of milestoneRows) {
    const record = row as {
      id: unknown;
      projectId: unknown;
      acceptorId: unknown;
      ownerId: unknown;
    };
    accepted.add(toNumber(record.id));
    readable.add(toNumber(record.projectId));
  }

  const ownedMilestones = await query
    .selectFrom('deliveryMilestones')
    .select(['projectId'])
    .where('ownerId', '=', userId)
    .execute();
  for (const row of ownedMilestones) {
    readable.add(toNumber((row as { projectId: unknown }).projectId));
  }

  for (const id of managed) readable.add(id);

  return {
    readAll: false,
    manageAll: false,
    readableContractIds: readable,
    managedContractIds: managed,
    acceptedMilestoneIds: accepted,
  };
}

export function canReadContract(
  scope: ContractScope,
  projectId: number,
): boolean {
  return scope.readAll || scope.readableContractIds.has(projectId);
}

export function canManageContract(
  scope: ContractScope,
  projectId: number,
): boolean {
  return scope.manageAll || scope.managedContractIds.has(projectId);
}

export function canAcceptMilestone(
  scope: ContractScope,
  milestoneId: number,
): boolean {
  return scope.manageAll || scope.acceptedMilestoneIds.has(milestoneId);
}

/**
 * Delivery task and issue maintenance.
 *
 * A project manager owns the projects they manage, while an implementation
 * consultant (`member`) maintains the tasks of every project they participate
 * in. The acceptance specialist and finance are deliberately excluded: they
 * review and read, they do not change the work items.
 */
export function canMaintainTasks(
  actor: Actor,
  scope: ContractScope,
  projectId: number,
): boolean {
  if (canManageContract(scope, projectId)) return true;
  return actor.roles.has('member') && canReadContract(scope, projectId);
}

/** Finance confirmations and payment registration. */
export function canManageMoney(actor: Actor): boolean {
  return actor.roles.has('lead') || actor.roles.has('finance');
}

/** Contract and milestone record maintenance. */
export function canMaintainContracts(actor: Actor): boolean {
  return actor.roles.has('lead') || actor.roles.has('manager');
}

/** Submitting deliverables for review. */
export function canSubmitDeliverable(actor: Actor): boolean {
  return (
    actor.roles.has('lead') ||
    actor.roles.has('manager') ||
    actor.roles.has('member')
  );
}

/**
 * Restrict a contract collection query to the actor's scope. Returns `null`
 * when the actor may reach no contract at all, so callers can short-circuit
 * instead of issuing a query that is guaranteed to be empty.
 */
export function projectIdFilter(
  scope: ContractScope,
): readonly number[] | true | null {
  if (scope.readAll) return true;
  const ids = [...scope.readableContractIds];
  if (!ids.length) return null;
  return ids;
}
