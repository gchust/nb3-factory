import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import {
  RepositoryError,
  type DatabaseManager,
  type FilterBuilder,
  type FilterGroupNode,
  type RepositoryPolicy,
  type ScopedRepository,
} from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';

import { IT_TICKETS_PAGE_ID } from './authorization.js';
import {
  IT_TICKETS_COLLECTION,
  toItTicketDto,
  type ItTicketCategory,
  type ItTicketDto,
  type ItTicketRow,
  type ItTicketStatus,
} from './ticket.js';

/** Binds the ticket domain service to the application container. */
export const itTicketsServiceToken =
  createServiceToken<ItTicketsService>('itTicketsService');

/** The repository the service writes through, scoped by the caller's policy. */
type ItTicketRepository = ScopedRepository<
  ItTicketRow,
  Partial<ItTicketRow>,
  Partial<ItTicketRow>
>;

/** A ticket the caller may not see, or one that does not exist; the API answers 404 to both. */
export class ItTicketNotFoundError extends Error {
  public constructor() {
    super('The ticket does not exist.');
    this.name = 'ItTicketNotFoundError';
  }
}

/** The reasons a status transition is refused; every one is an HTTP `FAILED_PRECONDITION`. */
export type ItTicketStateCode =
  | 'IT_TICKET_NOT_PENDING'
  | 'IT_TICKET_NOT_PROCESSING'
  | 'IT_TICKET_ALREADY_COMPLETED'
  | 'IT_TICKET_RESOLUTION_REQUIRED';

/**
 * A refused transition. The message is for the logs; the user-visible wording
 * is chosen from the code by the client locale files.
 */
export class ItTicketStateError extends Error {
  public constructor(
    public readonly code: ItTicketStateCode,
    message: string,
  ) {
    super(message);
    this.name = 'ItTicketStateError';
  }
}

export interface ItTicketListQuery {
  readonly status?: ItTicketStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface ItTicketListPage {
  readonly items: readonly ItTicketDto[];
  readonly total: number;
}

export interface ItTicketCreateInput {
  readonly title: string;
  readonly category: ItTicketCategory;
  readonly description?: string | null;
}

/** The signed-in person an action is recorded against. */
export interface ItTicketActor {
  readonly id: string;
  readonly name: string;
}

/**
 * The ticket operations the HTTP routes expose.
 *
 * Every method takes the request's `AuthorizationContext` and resolves the
 * composite action's data policy itself, so a route can never run a query
 * under the wrong scope. What the service does with that policy is the
 * business rule; what the policy contains is authorization's.
 */
export interface ItTicketsService {
  list(
    authz: AuthorizationContext,
    query: ItTicketListQuery,
  ): Promise<ItTicketListPage>;
  get(authz: AuthorizationContext, id: string): Promise<ItTicketDto>;
  create(
    authz: AuthorizationContext,
    input: ItTicketCreateInput,
    submitter: ItTicketActor,
  ): Promise<ItTicketDto>;
  start(
    authz: AuthorizationContext,
    id: string,
    handler: ItTicketActor,
  ): Promise<ItTicketDto>;
  complete(
    authz: AuthorizationContext,
    id: string,
    resolutionNote: string,
  ): Promise<ItTicketDto>;
}

/**
 * Resolves the composite action the caller is exercising into the Repository
 * Policy of the ticket table.
 *
 * A `deny` decision — no grant at all — is answered exactly the way the
 * framework answers it: `AuthorizationDeniedError` becomes `403 PERMISSION_DENIED`
 * in the route's error handler. A decision that carries no policy for this
 * table was granted for some other table only, which is equally a refusal here.
 */
async function resolvePolicy(
  authz: AuthorizationContext,
  action: string,
): Promise<RepositoryPolicy<ItTicketRow>> {
  const decision = await authz.authorize({
    resource: { type: 'composite', id: IT_TICKETS_PAGE_ID },
    action,
  });
  if (decision.effect === 'deny') {
    throw new AuthorizationDeniedError(decision);
  }
  const policy = decision.conditions?.database?.[IT_TICKETS_COLLECTION];
  if (!policy) {
    throw new AuthorizationDeniedError(decision);
  }
  // The policy is stored as a plain object in the decision; it is already the
  // framework's policy for this Collection, so no re-shaping is needed here.
  return policy;
}

export interface CreateItTicketsServiceOptions {
  readonly database: DatabaseManager;
}

export function createItTicketsService({
  database,
}: CreateItTicketsServiceOptions): ItTicketsService {
  const repositoryFor = (
    policy: RepositoryPolicy<ItTicketRow>,
  ): ItTicketRepository =>
    database
      .repository<ItTicketRow>(IT_TICKETS_COLLECTION)
      .withPolicy(policy) as unknown as ItTicketRepository;

  const byId = (id: string) => (filter: FilterBuilder<ItTicketRow>) =>
    filter.string('id').eq(id);

  const byIdInStatus =
    (id: string, status: ItTicketStatus) =>
    (filter: FilterBuilder<ItTicketRow>) =>
      filter.and([
        filter.string('id').eq(id),
        filter.string('status').eq(status),
      ]);

  /**
   * Runs a status-guarded update, turning the framework's "no row matched" into
   * the transition refusal it actually is: the caller lost a race against
   * another handler rather than naming a ticket that does not exist.
   */
  const updateOneOrRefuse = async (
    repository: ItTicketRepository,
    filter: (builder: FilterBuilder<ItTicketRow>) => FilterGroupNode,
    values: Partial<ItTicketRow>,
    refusal: { code: ItTicketStateCode; message: string },
  ) => {
    try {
      return await repository.updateOne({ filter, values });
    } catch (error) {
      if (
        error instanceof RepositoryError &&
        error.code === 'RECORD_NOT_FOUND'
      ) {
        throw new ItTicketStateError(refusal.code, refusal.message);
      }
      throw error;
    }
  };

  const readById = async (
    repository: ItTicketRepository,
    id: string,
  ): Promise<ItTicketRow> => {
    // The read policy's scope is applied as a `WHERE` clause, so a ticket
    // outside it is invisible rather than forbidden: a direct link to
    // somebody else's ticket is answered 404, exactly like a missing one.
    const row = await repository.findOne({ filter: byId(id) });
    if (!row) {
      throw new ItTicketNotFoundError();
    }
    return row;
  };

  return {
    async list(authz, { status, page, pageSize }) {
      const policy = await resolvePolicy(authz, 'view');
      const repository = repositoryFor(policy);
      const filter = status
        ? (builder: FilterBuilder<ItTicketRow>) =>
            builder.string('status').eq(status)
        : undefined;
      const [rows, total] = await Promise.all([
        repository.findMany({
          ...(filter ? { filter } : {}),
          sort: (sort) => sort.field('createdAt').desc(),
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        repository.count(filter ? { filter } : {}),
      ]);
      return { items: rows.map(toItTicketDto), total };
    },

    async get(authz, id) {
      const policy = await resolvePolicy(authz, 'view');
      return toItTicketDto(await readById(repositoryFor(policy), id));
    },

    async create(authz, input, submitter) {
      const policy = await resolvePolicy(authz, 'create');
      const now = new Date();
      const { record } = await repositoryFor(policy).createOne({
        values: {
          id: crypto.randomUUID(),
          title: input.title,
          category: input.category,
          description: input.description ?? null,
          status: 'pending',
          resolutionNote: null,
          // The submitter always comes from the session, never the request body.
          submitterId: submitter.id,
          submitterName: submitter.name,
          handlerId: null,
          handlerName: null,
          startedAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return toItTicketDto(record);
    },

    async start(authz, id, handler) {
      const policy = await resolvePolicy(authz, 'start');
      const repository = repositoryFor(policy);
      const current = await readById(repository, id);
      if (current.status !== 'pending') {
        throw new ItTicketStateError(
          'IT_TICKET_NOT_PENDING',
          'Only a pending ticket can be started.',
        );
      }
      const now = new Date();
      // The status is part of the predicate, not only of the check above: two
      // handlers acting at the same time cannot both start the same ticket.
      // Losing that race leaves no row to update, which is reported as a
      // refused transition rather than as a missing ticket.
      const { record } = await updateOneOrRefuse(
        repository,
        byIdInStatus(id, 'pending'),
        {
          status: 'processing',
          handlerId: handler.id,
          handlerName: handler.name,
          startedAt: now,
          updatedAt: now,
        },
        {
          code: 'IT_TICKET_NOT_PENDING',
          message: 'The ticket was handled by somebody else in the meantime.',
        },
      );
      return toItTicketDto(record);
    },

    async complete(authz, id, resolutionNote) {
      const policy = await resolvePolicy(authz, 'complete');
      const repository = repositoryFor(policy);
      const current = await readById(repository, id);
      if (current.status === 'completed') {
        throw new ItTicketStateError(
          'IT_TICKET_ALREADY_COMPLETED',
          'The ticket is already completed.',
        );
      }
      if (current.status !== 'processing') {
        throw new ItTicketStateError(
          'IT_TICKET_NOT_PROCESSING',
          'Only a ticket being handled can be completed.',
        );
      }
      // The handler has to write down what was done; the client disables the
      // button until there is a note, and the server refuses an empty one.
      if (resolutionNote.trim().length === 0) {
        throw new ItTicketStateError(
          'IT_TICKET_RESOLUTION_REQUIRED',
          'A resolution note is required before completing a ticket.',
        );
      }
      const now = new Date();
      const { record } = await updateOneOrRefuse(
        repository,
        byIdInStatus(id, 'processing'),
        {
          status: 'completed',
          resolutionNote,
          completedAt: now,
          updatedAt: now,
        },
        {
          code: 'IT_TICKET_NOT_PROCESSING',
          message: 'The ticket stopped being handled in the meantime.',
        },
      );
      return toItTicketDto(record);
    },
  };
}
