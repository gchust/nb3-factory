import {
  RepositoryError,
  type DatabaseManager,
  type RepositoryPolicy,
  type ScopedRepository,
} from '@nocobase/db';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import {
  REPAIR_TICKETS_COLLECTION,
  REPAIR_TICKETS_RESOURCE,
  TICKET_ACTIONS,
  type RepairTicketRow,
} from '../tickets-resources.js';

/**
 * Domain logic for repair tickets. It never touches a Hono context: the route
 * validates input, answers HTTP and maps the errors below, while this module
 * decides who may do what (through the authorization policies it is handed)
 * and how a ticket transitions.
 */

export type RepairTicketDto = RepairTicketRow & {
  submitterName: string;
  handlerName: string | null;
};

/** An expected failure the route turns into a JSON response. Never a database error. */
export class TicketError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TicketError';
  }
}

type TicketPolicy = RepositoryPolicy<RepairTicketRow>;

function isRecordNotFound(error: unknown): boolean {
  return error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND';
}

/**
 * A policy-bound repository over exactly the fields the policy permits. The
 * record type is widened back to the full row: every field the workflow reads
 * is inside the action's read allowlist, and a field outside it is refused by
 * the policy at query time rather than silently returned.
 */
function scopedRepository(
  database: DatabaseManager,
  policy: TicketPolicy,
): ScopedRepository<RepairTicketRow> {
  return database
    .repository<RepairTicketRow>(REPAIR_TICKETS_COLLECTION)
    .withPolicy(policy) as unknown as ScopedRepository<RepairTicketRow>;
}

/**
 * Resolves one composite action's record policy. A denied check, or a
 * collection the action does not compose, is a forbidden operation; the
 * record scope inside a permitted policy still constrains every query.
 */
async function requirePolicy(
  authorization: AuthorizationContext,
  action: (typeof TICKET_ACTIONS)[keyof typeof TICKET_ACTIONS],
): Promise<TicketPolicy> {
  const decision = await authorization.authorize({
    resource: { type: 'composite', id: REPAIR_TICKETS_RESOURCE },
    action,
  });
  const policy = decision.conditions?.database?.[REPAIR_TICKETS_COLLECTION];
  if (decision.effect === 'deny' || !policy) {
    throw new TicketError(403, 'FORBIDDEN', 'You may not perform this action.');
  }
  return policy;
}

/** Trusted, minimal lookup of display names for ids already read under a policy. */
async function loadUserNames(
  database: DatabaseManager,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) {
    return names;
  }
  const rows = (await database
    .query()
    .selectFrom('user')
    .select(['id', 'name', 'username'])
    .where('id', 'in', ids)
    .execute()) as unknown as Array<{
    id: string;
    name: string | null;
    username: string | null;
  }>;
  for (const row of rows) {
    names.set(row.id, row.name || row.username || row.id);
  }
  return names;
}

async function toDtos(
  database: DatabaseManager,
  rows: readonly RepairTicketRow[],
): Promise<RepairTicketDto[]> {
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.submitterId);
    if (row.handlerId) {
      ids.add(row.handlerId);
    }
  }
  const names = await loadUserNames(database, [...ids]);
  return rows.map((row) => ({
    ...row,
    submitterName: names.get(row.submitterId) ?? row.submitterId,
    handlerName: row.handlerId
      ? (names.get(row.handlerId) ?? row.handlerId)
      : null,
  }));
}

export interface RepairTicketsService {
  list(status?: string): Promise<RepairTicketDto[]>;
  get(id: string): Promise<RepairTicketDto>;
  create(
    input: { title: string; category: string; description: string | null },
    submitterId: string,
  ): Promise<RepairTicketDto>;
  start(id: string, handlerId: string): Promise<RepairTicketDto>;
  complete(
    id: string,
    handlerId: string,
    resolution: string,
  ): Promise<RepairTicketDto>;
}

export function createRepairTicketsService(
  database: DatabaseManager,
  authorization: AuthorizationContext,
): RepairTicketsService {
  return {
    async list(status) {
      const policy = await requirePolicy(authorization, TICKET_ACTIONS.view);
      const rows = await scopedRepository(database, policy).findMany({
        sort: (sort) => sort.field('createdAt').desc(),
        ...(status ? { filter: { status } } : {}),
      });
      return toDtos(database, rows);
    },

    async get(id) {
      const policy = await requirePolicy(authorization, TICKET_ACTIONS.view);
      const row = await scopedRepository(database, policy).findOne({
        filter: { id },
      });
      if (!row) {
        // The record scope makes another person's ticket indistinguishable from
        // a missing one, so a direct link cannot confirm that it exists.
        throw new TicketError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
      }
      return (await toDtos(database, [row]))[0];
    },

    async create(input, submitterId) {
      const policy = await requirePolicy(authorization, TICKET_ACTIONS.create);
      const now = new Date();
      const { record } = await scopedRepository(database, policy).createOne({
        values: {
          id: crypto.randomUUID(),
          title: input.title,
          category: input.category,
          description: input.description,
          submitterId,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        },
      });
      return (await toDtos(database, [record]))[0];
    },

    async start(id, handlerId) {
      const policy = await requirePolicy(authorization, TICKET_ACTIONS.start);
      const scoped = scopedRepository(database, policy);
      const existing = await scoped.findOne({ filter: { id } });
      if (!existing) {
        throw new TicketError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
      }
      if (existing.status !== 'pending') {
        throw new TicketError(
          409,
          'TICKET_NOT_PENDING',
          'Only a pending ticket can be started.',
        );
      }
      const now = new Date();
      try {
        const { record } = await scoped.updateOne({
          // The predicate keeps a concurrent start from overwriting the first handler.
          filter: { id, status: 'pending' },
          values: {
            status: 'processing',
            handlerId,
            startedAt: now,
            updatedAt: now,
          },
        });
        return (await toDtos(database, [record]))[0];
      } catch (error) {
        if (isRecordNotFound(error)) {
          throw new TicketError(
            409,
            'TICKET_NOT_PENDING',
            'The ticket was already started by someone else.',
          );
        }
        throw error;
      }
    },

    async complete(id, handlerId, resolution) {
      const policy = await requirePolicy(
        authorization,
        TICKET_ACTIONS.complete,
      );
      const scoped = scopedRepository(database, policy);
      const existing = await scoped.findOne({ filter: { id } });
      if (!existing) {
        throw new TicketError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
      }
      if (existing.status === 'completed') {
        throw new TicketError(
          409,
          'TICKET_COMPLETED',
          'A completed ticket is read-only.',
        );
      }
      if (existing.status !== 'processing') {
        throw new TicketError(
          409,
          'TICKET_NOT_PROCESSING',
          'The ticket must be started before it can be completed.',
        );
      }
      if (existing.handlerId !== handlerId) {
        throw new TicketError(
          409,
          'TICKET_HANDLED_BY_OTHER',
          'Only the handler who started the ticket can complete it.',
        );
      }
      const now = new Date();
      try {
        const { record } = await scoped.updateOne({
          filter: { id, status: 'processing', handlerId },
          values: {
            status: 'completed',
            resolution,
            completedAt: now,
            updatedAt: now,
          },
        });
        return (await toDtos(database, [record]))[0];
      } catch (error) {
        if (isRecordNotFound(error)) {
          throw new TicketError(
            409,
            'TICKET_STATE_CHANGED',
            'The ticket changed while it was being completed.',
          );
        }
        throw error;
      }
    },
  };
}
