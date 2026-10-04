import type { DatabaseManager } from '@nocobase/db';

import type { ServiceActor } from './access.js';
import { hasRole } from './access.js';
import type { Ticket, TicketShare } from './domain.js';

/**
 * Record visibility derived from the actor's business role plus the ticket
 * shares that exist in the database. This is the single place the application
 * narrows what a role may read; the authorization composite decides whether the
 * role holds the operation at all.
 *
 * The demonstration dataset is small, so the narrowing happens in memory. The
 * repository filter grammar has no set-membership operator, which is the other
 * reason not to push these predicates into SQL.
 */
export type Visibility =
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }
  | { readonly kind: 'ids'; readonly ids: readonly number[] };

export function visibleAll(actor: ServiceActor): boolean {
  return actor.unrestricted || hasRole(actor, 'supervisor');
}

async function allTickets(
  database: DatabaseManager,
): Promise<readonly Ticket[]> {
  return (await database.repository<Ticket>('tickets').findMany()) ?? [];
}

async function activeShareTicketIds(
  database: DatabaseManager,
  userId: string,
): Promise<number[]> {
  const now = Date.now();
  const shares =
    (await database.repository<TicketShare>('ticket_shares').findMany({
      filter: (filter) =>
        filter.and([
          filter.number('granteeId').eq(Number(userId)),
          filter.boolean('revoked').isFalse(),
        ]),
    })) ?? [];
  return shares
    .filter((share) => !share.expiresAt || Date.parse(share.expiresAt) > now)
    .map((share) => share.ticketId);
}

/**
 * Ticket ids the actor may read. Supervisors read everything; engineers read
 * tickets assigned to them or temporarily shared with them; observers read only
 * shared tickets; the integration account reads only tickets it reported.
 */
export async function visibleTicketIds(
  database: DatabaseManager,
  actor: ServiceActor,
): Promise<Visibility> {
  if (visibleAll(actor)) return { kind: 'all' };
  const tickets = await allTickets(database);
  if (hasRole(actor, 'integration')) {
    return toIds(
      tickets
        .filter((ticket) => String(ticket.reporterId ?? '') === actor.id)
        .map((ticket) => ticket.id),
    );
  }
  if (hasRole(actor, 'engineer') || hasRole(actor, 'observer')) {
    const ids = new Set<number>(await activeShareTicketIds(database, actor.id));
    if (hasRole(actor, 'engineer')) {
      for (const ticket of tickets) {
        if (String(ticket.assigneeId ?? '') === actor.id) ids.add(ticket.id);
      }
    }
    return toIds([...ids]);
  }
  return { kind: 'none' };
}

/**
 * Device ids reachable through the actor's visible tickets. Engineers and
 * observers see only the equipment their tickets need, never the whole ledger.
 */
export async function visibleDeviceIds(
  database: DatabaseManager,
  actor: ServiceActor,
): Promise<Visibility> {
  if (visibleAll(actor)) return { kind: 'all' };
  const tickets = await visibleTicketIds(database, actor);
  if (tickets.kind === 'none') return { kind: 'none' };
  if (tickets.kind === 'all') return { kind: 'all' };
  const allowed = new Set(tickets.ids);
  const rows = await allTickets(database);
  return toIds(
    rows
      .filter((ticket) => allowed.has(ticket.id))
      .map((ticket) => ticket.deviceId)
      .filter((id): id is number => typeof id === 'number'),
  );
}

export async function visibleCustomerIds(
  database: DatabaseManager,
  actor: ServiceActor,
): Promise<Visibility> {
  if (visibleAll(actor)) return { kind: 'all' };
  const tickets = await visibleTicketIds(database, actor);
  if (tickets.kind === 'none') return { kind: 'none' };
  if (tickets.kind === 'all') return { kind: 'all' };
  const allowed = new Set(tickets.ids);
  const rows = await allTickets(database);
  return toIds(
    rows
      .filter((ticket) => allowed.has(ticket.id))
      .map((ticket) => ticket.customerId)
      .filter((id): id is number => typeof id === 'number'),
  );
}

function toIds(ids: readonly number[]): Visibility {
  const unique = [...new Set(ids)];
  return unique.length === 0 ? { kind: 'none' } : { kind: 'ids', ids: unique };
}

/** Whether a ticket returned by a read may be shown without internal notes. */
export function isObserverOnly(actor: ServiceActor): boolean {
  return !visibleAll(actor) && hasRole(actor, 'observer');
}
