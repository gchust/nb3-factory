import type { AuthorizationScope } from '@nocobase/authorization/core';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import type { Context } from 'hono';
import { asText } from './values.js';

/**
 * Who is calling, what the backend has granted them, and which region they
 * belong to.
 *
 * Capabilities come from the permission-set grants registered in
 * `server/service-authorization.ts`; the region comes from `serviceMembers`,
 * which the Users page maintains through the registered role scope. Neither is
 * derived from a hard-coded username.
 */
export interface ServiceCaller {
  id: string;
  name: string;
  region: string | null;
  capabilities: Readonly<Record<string, boolean>>;
}

const CAPABILITY_KEYS: readonly [string, string, string][] = [
  ['tickets.view', 'service.tickets', 'view'],
  ['tickets.create', 'service.tickets', 'create'],
  ['tickets.edit', 'service.tickets', 'edit'],
  ['tickets.assign', 'service.tickets', 'assign'],
  ['tickets.process', 'service.tickets', 'process'],
  ['tickets.confirm', 'service.tickets', 'confirm'],
  ['tickets.transfer', 'service.tickets', 'transfer'],
  ['tickets.share', 'service.tickets', 'share'],
  ['customers.view', 'service.customers', 'view'],
  ['customers.manage', 'service.customers', 'manage'],
  ['devices.view', 'service.devices', 'view'],
  ['devices.manage', 'service.devices', 'manage'],
  ['knowledge.view', 'service.knowledge', 'view'],
  ['knowledge.manage', 'service.knowledge', 'manage'],
  ['inspections.view', 'service.inspections', 'view'],
  ['inspections.manage', 'service.inspections', 'manage'],
  ['dashboard.view', 'service.dashboard', 'view'],
  ['assistant.use', 'service.assistant', 'use'],
  ['integration.consume', 'service.integration', 'consume'],
  ['members.view', 'service.members', 'view'],
  ['members.manage', 'service.members', 'manage'],
  ['records.viewAll', 'service.records', 'viewAll'],
];

/** A capability check against the caller's own grants, not the route's. */
export async function callerCan(
  scope: AuthorizationScope,
  resource: string,
  action: string,
): Promise<boolean> {
  return scope.can({
    resource: { type: 'resource', id: resource },
    action,
  });
}

export async function resolveCaller(
  app: Application,
  context: Context,
): Promise<ServiceCaller> {
  const auth = context.get('auth') as
    | { user: { id: string; name?: string; username?: string | null } }
    | undefined;
  if (!auth?.user?.id) throw new Error('Authentication required');
  const scope = context.get('authz') as AuthorizationScope;
  const capabilities: Record<string, boolean> = {};
  for (const [key, resource, action] of CAPABILITY_KEYS) {
    capabilities[key] = await callerCan(scope, resource, action);
  }
  const database = app.container.resolve(databaseManagerToken);
  const member = await database
    .query()
    .selectFrom('serviceMembers')
    .select(['region', 'teamName'])
    .where('userId', '=', auth.user.id)
    .executeTakeFirst();
  return {
    id: auth.user.id,
    name: auth.user.name ?? auth.user.username ?? auth.user.id,
    region: member?.region ? asText(member.region) : null,
    capabilities,
  };
}

/** Throws a 403-shaped error when the caller lacks the business action. */
export async function requireCapability(
  caller: ServiceCaller,
  key: string,
): Promise<void> {
  if (!caller.capabilities[key]) {
    const error = new Error(`Forbidden: ${key}`) as Error & { status: number };
    error.status = 403;
    throw error;
  }
}

/** The regions a ticket may be dispatched to, matching the field service map. */
export const ASSIGNABLE_REGIONS = ['east', 'south', 'north', 'west'] as const;

/**
 * Whether a member's region is one a ticket can actually be dispatched to. A
 * member with no region (observer, collaborator, integrator) is not a field
 * engineer and must never be offered as the assignee.
 */
export function isAssignableRegion(region: string | null | undefined): boolean {
  return (
    typeof region === 'string' &&
    (ASSIGNABLE_REGIONS as readonly string[]).includes(region)
  );
}

/**
 * Whether one account holds the business action needed to work a ticket.
 *
 * Dispatch and transfer hand a ticket to someone who must be able to process
 * it. Resolving the target's own grants — the same backend decision the route
 * middleware makes for the caller — keeps a read-only observer or a
 * collaborator without `process` from receiving a ticket they cannot advance.
 * The caller's request-scoped scope cannot answer this, so the check builds a
 * scope for the target identity instead of guessing from a stored role name.
 */
export async function canProcessTickets(
  app: Application,
  userId: string,
): Promise<boolean> {
  if (!userId) return false;
  const authorization = app.container.resolve(authorizationToken);
  const principal = { type: 'user', id: userId };
  const subjects = await authorization.subjects.resolveFor(principal);
  return await authorization.for({ principal, subjects }).can({
    resource: { type: 'resource', id: 'service.tickets' },
    action: 'process',
  });
}

export interface TicketScopeRow {
  id: number;
  region: string;
  confidential: boolean;
  assigneeId: string | null;
  reporterId: string | null;
}

/**
 * Whether the caller may read records outside their own region. A supervisor's
 * `assign` capability answers for the whole board; the read-only observer and
 * administrator hold the explicit `records.viewAll` grant instead. It never
 * widens access to confidential records, which `ticketAccessible` handles.
 */
export function seesEveryRegion(caller: ServiceCaller): boolean {
  return (
    caller.capabilities['tickets.assign'] === true ||
    caller.capabilities['records.viewAll'] === true
  );
}

/** The region a caller's record reads are confined to, or null when unscoped. */
export function regionScopeOf(caller: ServiceCaller): string | null {
  return seesEveryRegion(caller) ? null : caller.region;
}

/**
 * The single record-level access rule for a ticket. It is deliberately
 * independent of the permission-set key: a supervisor's `assign` capability
 * widens it to every region, an explicit share or assignment widens it to the
 * individual, and a collaborator with no region only reaches records that were
 * handed to them.
 */
export async function ticketAccessible(
  caller: ServiceCaller,
  ticket: TicketScopeRow,
  sharedTicketIds: ReadonlySet<number>,
): Promise<boolean> {
  const manager = caller.capabilities['tickets.assign'] === true;
  if (manager) return true;
  if (caller.capabilities['records.viewAll'] === true && !ticket.confidential)
    return true;
  if (ticket.assigneeId && ticket.assigneeId === caller.id) return true;
  if (ticket.reporterId && ticket.reporterId === caller.id) return true;
  // A share widens *reading* only. It never lets the recipient write, so it is
  // also refused for a confidential ticket, which a collaborator must not see.
  if (!ticket.confidential && sharedTicketIds.has(Number(ticket.id)))
    return true;
  if (
    !ticket.confidential &&
    caller.region &&
    String(ticket.region) === caller.region
  )
    return true;
  return false;
}

/**
 * Whether the caller may change a ticket. Reading a shared ticket is not
 * permission to operate on it: only a supervisor's `assign` grant, the
 * assignee, the reporter, or a same-region engineer whose business action was
 * granted may write. The read-only `records.viewAll` observer and an explicit
 * share never grant a write.
 */
export function ticketWritable(
  caller: ServiceCaller,
  ticket: TicketScopeRow,
): boolean {
  if (caller.capabilities['tickets.assign'] === true) return true;
  if (ticket.assigneeId && ticket.assigneeId === caller.id) return true;
  if (ticket.reporterId && ticket.reporterId === caller.id) return true;
  if (
    !ticket.confidential &&
    caller.region &&
    String(ticket.region) === caller.region
  )
    return true;
  return false;
}

/** Ticket ids explicitly shared with the caller and still active. */
export async function sharedTicketIds(
  database: DatabaseManager,
  userId: string,
): Promise<Set<number>> {
  const rows = await database
    .query()
    .selectFrom('serviceTicketShares')
    .select('ticketId')
    .where('userId', '=', userId)
    .where('active', '=', true)
    .execute();
  return new Set(rows.map((row) => Number(row.ticketId)));
}
