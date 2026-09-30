import type {
  DatabaseManager,
  RepositoryPolicy,
  ScopedRepository,
} from '@nocobase/db';

import type { Ticket } from './resources.js';

/** A ticket plus the display names the list needs. */
export interface TicketView extends Ticket {
  submitterName: string | null;
  handlerName: string | null;
}

export interface CreateTicketInput {
  title: string;
  category: string;
  description?: string | null;
}

export interface ListTicketsOptions {
  status?: string;
}

/** A requested state change that the ticket's current state does not allow. */
export class TicketStateError extends Error {
  constructor(
    message: string,
    readonly code: 'TICKET_NOT_FOUND' | 'TICKET_STATE_CONFLICT',
  ) {
    super(message);
    this.name = 'TicketStateError';
  }
}

export interface TicketService {
  list(
    policy: RepositoryPolicy<Ticket> | undefined,
    options?: ListTicketsOptions,
  ): Promise<TicketView[]>;
  get(
    policy: RepositoryPolicy<Ticket> | undefined,
    id: number,
  ): Promise<TicketView | undefined>;
  create(
    policy: RepositoryPolicy<Ticket> | undefined,
    input: CreateTicketInput,
    submitterId: string,
  ): Promise<TicketView>;
  start(
    policy: RepositoryPolicy<Ticket> | undefined,
    id: number,
    handlerId: string,
  ): Promise<TicketView>;
  complete(
    policy: RepositoryPolicy<Ticket> | undefined,
    id: number,
    resolution: string,
    handlerId: string,
  ): Promise<TicketView>;
}

type UserRow = {
  id: string;
  name: string | null;
  username: string | null;
};

type TicketRepository = ScopedRepository<
  Ticket,
  Partial<Ticket>,
  Partial<Ticket>
>;

/**
 * The ticket domain. It never reads a Hono context, returns an HTTP status or
 * decides what an actor may do: the route authorizes the operation, folds the
 * decision into a Repository Policy, and this service executes it. `undefined`
 * means an unrestricted decision (a superuser), which is why it narrows to the
 * plain Repository rather than inventing an allow-all policy.
 */
export function createTicketService(database: DatabaseManager): TicketService {
  function scoped(
    policy: RepositoryPolicy<Ticket> | undefined,
  ): TicketRepository {
    // Bind an allow-all policy first so both branches share one return type;
    // `narrow` only ever intersects, and the base imposes no restriction.
    const repository = database
      .repository<Ticket>('tickets')
      .withPolicy({ read: true, create: true, update: true, delete: true });
    return policy ? repository.narrow(policy) : repository;
  }

  async function namesFor(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id) => id.length > 0))];
    if (unique.length === 0) {
      return new Map();
    }
    const rows: UserRow[] = await database
      .query()
      .selectFrom<UserRow>('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', unique)
      .execute();

    return new Map(
      rows.map((row) => [String(row.id), row.name ?? row.username ?? '']),
    );
  }

  function view(ticket: Ticket, names: Map<string, string>): TicketView {
    return {
      ...ticket,
      submitterName: names.get(ticket.submitterId) ?? null,
      handlerName: ticket.handlerId
        ? (names.get(ticket.handlerId) ?? null)
        : null,
    };
  }

  return {
    async list(policy, options = {}) {
      const status = options.status;
      const records = await scoped(policy).findMany({
        filter: status ? (f) => f.string('status').eq(status) : undefined,
        sort: (sort) => sort.field('createdAt').desc(),
      });

      const names = await namesFor(
        records.flatMap((ticket) => [
          ticket.submitterId,
          ...(ticket.handlerId ? [ticket.handlerId] : []),
        ]),
      );
      return records.map((ticket) => view(ticket, names));
    },

    async get(policy, id) {
      const record = await scoped(policy).findOne({
        filter: (f) => f.number('id').eq(id),
      });
      if (!record) {
        return undefined;
      }
      const names = await namesFor([
        record.submitterId,
        ...(record.handlerId ? [record.handlerId] : []),
      ]);
      return view(record, names);
    },

    async create(policy, input, submitterId) {
      const now = new Date();
      const { record } = await scoped(policy).createOne({
        values: {
          title: input.title,
          category: input.category,
          description: input.description ?? null,
          status: 'pending',
          submitterId,
          createdAt: now,
          updatedAt: now,
        },
      });

      const names = await namesFor([submitterId]);
      return view(record, names);
    },

    async start(policy, id, handlerId) {
      const repository = scoped(policy);
      const current = await repository.findOne({
        filter: (f) => f.number('id').eq(id),
      });

      if (!current) {
        throw new TicketStateError('Ticket not found.', 'TICKET_NOT_FOUND');
      }
      if (current.status !== 'pending') {
        throw new TicketStateError(
          'Only a pending ticket can start being handled.',
          'TICKET_STATE_CONFLICT',
        );
      }

      const { record } = await repository.updateOne({
        filter: (f) =>
          f.and([f.number('id').eq(id), f.string('status').eq('pending')]),
        values: {
          status: 'in_progress',
          handlerId,
          updatedAt: new Date(),
        },
      });

      const names = await namesFor([record.submitterId, handlerId]);
      return view(record, names);
    },

    async complete(policy, id, resolution, handlerId) {
      const repository = scoped(policy);
      const current = await repository.findOne({
        filter: (f) => f.number('id').eq(id),
      });

      if (!current) {
        throw new TicketStateError('Ticket not found.', 'TICKET_NOT_FOUND');
      }
      if (current.status === 'completed') {
        throw new TicketStateError(
          'A completed ticket is immutable.',
          'TICKET_STATE_CONFLICT',
        );
      }
      if (current.status !== 'in_progress') {
        throw new TicketStateError(
          'Only a ticket being handled can be resolved.',
          'TICKET_STATE_CONFLICT',
        );
      }

      const now = new Date();
      const { record } = await repository.updateOne({
        filter: (f) =>
          f.and([f.number('id').eq(id), f.string('status').eq('in_progress')]),
        values: {
          status: 'completed',
          resolution,
          handledAt: now,
          updatedAt: now,
        },
      });

      const names = await namesFor([
        record.submitterId,
        ...(record.handlerId ? [record.handlerId] : [handlerId]),
      ]);
      return view(record, names);
    },
  };
}
