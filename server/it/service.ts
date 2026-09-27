import {
  RepositoryError,
  type DatabaseManager,
  type RepositoryPolicy,
} from '@nocobase/db';
import type { SelectBuilder } from '@nocobase/repository-input';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import { createServiceToken } from '@nocobase/service-provider';

import {
  canTransition,
  validateResolution,
  validateTicketDraft,
  type ItTransition,
} from './rules.js';
import {
  IT_TICKETS_COLLECTION,
  IT_TICKETS_RESOURCE,
  type ItTicket,
} from './resources.js';

/** One ticket as the API returns it, relations included. */
export type ItTicketRecord = ItTicket;

export type ItTicketErrorCode =
  'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'INVALID_TRANSITION';

/** A business failure the route turns into a status code. */
export class ItTicketError extends Error {
  constructor(
    readonly code: ItTicketErrorCode,
    readonly reason?: string,
  ) {
    super(reason ? `${code}: ${reason}` : code);
    this.name = 'ItTicketError';
  }
}

export interface ItTicketFilters {
  status?: string;
  category?: string;
  keyword?: string;
}

export interface ItTicketTransitionInput {
  transition: ItTransition;
  resolution?: unknown;
}

const MAX_TICKETS = 200;

/**
 * Read selection shared by list and detail: the scalar columns plus the two
 * people relations. The bound Policy still intersects this with what the
 * caller may read, so an employee never receives another submitter's row.
 */
function ticketSelect(select: SelectBuilder<ItTicket>) {
  return select
    .fields(
      'id',
      'title',
      'category',
      'description',
      'status',
      'resolution',
      'submitterId',
      'handlerId',
      'createdAt',
      'updatedAt',
      'startedAt',
      'completedAt',
    )
    .include('submitter', (person) => person.fields('id', 'name'))
    .include('handler', (person) => person.fields('id', 'name'));
}

/**
 * Reads the database policy a composite decision resolved to. A `deny` decision
 * and a decision without a database policy both mean the caller may not touch
 * this collection at all.
 */
function policyFrom(
  decision: Awaited<ReturnType<AuthorizationContext['authorize']>>,
): RepositoryPolicy<ItTicket> {
  if (decision.effect === 'deny') throw new ItTicketError('FORBIDDEN');
  const database = decision.conditions?.database as
    Record<string, RepositoryPolicy<ItTicket> | undefined> | undefined;
  const policy = database?.[IT_TICKETS_COLLECTION];
  if (!policy) throw new ItTicketError('FORBIDDEN');
  return policy;
}

/**
 * Owns the IT ticket domain: authorization, data access and the lifecycle
 * rules. It never reads an HTTP context and never returns a status code; the
 * route maps `ItTicketError` and repository failures.
 */
export class ItTicketService {
  constructor(private readonly database: DatabaseManager) {}

  private async policyFor(
    authorization: AuthorizationContext,
    action: 'view' | 'create' | 'handle',
  ): Promise<RepositoryPolicy<ItTicket>> {
    const decision = await authorization.authorize({
      resource: { type: 'composite', id: IT_TICKETS_RESOURCE },
      action,
    });
    return policyFrom(decision);
  }

  async list(
    authorization: AuthorizationContext,
    filters: ItTicketFilters,
  ): Promise<ItTicketRecord[]> {
    const policy = await this.policyFor(authorization, 'view');
    const status = filters.status?.trim();
    const category = filters.category?.trim();
    const keyword = filters.keyword?.trim();
    const hasFilter = Boolean(status || category || keyword);

    const rows = await this.database
      .repository<ItTicket>(IT_TICKETS_COLLECTION)
      .withPolicy(policy)
      .findMany({
        ...(hasFilter
          ? {
              filter: (filter) => {
                const items = [];
                if (status) items.push(filter.string('status').eq(status));
                if (category)
                  items.push(filter.string('category').eq(category));
                if (keyword)
                  items.push(
                    filter
                      .string('title')
                      .includes(keyword, { mode: 'insensitive' }),
                  );
                return filter.and(items);
              },
            }
          : {}),
        sort: (sort) => sort.field('createdAt').desc(),
        limit: MAX_TICKETS,
        select: ticketSelect,
      });
    return rows as ItTicketRecord[];
  }

  async get(
    authorization: AuthorizationContext,
    id: number,
  ): Promise<ItTicketRecord> {
    const policy = await this.policyFor(authorization, 'view');
    const record = await this.database
      .repository<ItTicket>(IT_TICKETS_COLLECTION)
      .withPolicy(policy)
      .findOne({ filter: { id }, select: ticketSelect });
    if (!record) throw new ItTicketError('NOT_FOUND');
    return record as ItTicketRecord;
  }

  async create(
    authorization: AuthorizationContext,
    input: { title?: unknown; category?: unknown; description?: unknown },
  ): Promise<ItTicketRecord> {
    const principal = authorization.identity.principal;
    if (principal.type !== 'user') throw new ItTicketError('FORBIDDEN');

    const validated = validateTicketDraft(input);
    if (!validated.ok)
      throw new ItTicketError('INVALID_INPUT', validated.reason);

    const policy = await this.policyFor(authorization, 'create');
    const now = new Date();
    const repository = this.database
      .repository<ItTicket>(IT_TICKETS_COLLECTION)
      .withPolicy(policy);
    const created = await repository.createOne({
      values: {
        title: validated.value.title,
        category: validated.value.category,
        description: validated.value.description || null,
        status: 'pending',
        submitterId: principal.id,
        createdAt: now,
        updatedAt: now,
      },
    });
    const result = await repository.findOne({
      filter: { id: created.record.id },
      select: ticketSelect,
    });
    if (!result) throw new ItTicketError('NOT_FOUND');
    return result as ItTicketRecord;
  }

  async transition(
    authorization: AuthorizationContext,
    id: number,
    input: ItTicketTransitionInput,
  ): Promise<ItTicketRecord> {
    const principal = authorization.identity.principal;
    if (principal.type !== 'user') throw new ItTicketError('FORBIDDEN');
    if (input.transition !== 'start' && input.transition !== 'complete')
      throw new ItTicketError('INVALID_INPUT');

    const policy = await this.policyFor(authorization, 'handle');

    return this.database.transaction(async (connection) => {
      const repository = connection
        .repository<ItTicket>(IT_TICKETS_COLLECTION)
        .withPolicy(policy);

      const current = await repository.findOne({ filter: { id } });
      if (!current) throw new ItTicketError('NOT_FOUND');
      if (!canTransition(current.status, input.transition))
        throw new ItTicketError('INVALID_TRANSITION', current.status);

      const now = new Date();
      const values: Partial<ItTicket> = {
        status: input.transition === 'start' ? 'processing' : 'completed',
        updatedAt: now,
      };

      if (input.transition === 'start') {
        values.handlerId = principal.id;
        values.startedAt = now;
      } else {
        const resolution = validateResolution(input.resolution);
        if (!resolution.ok)
          throw new ItTicketError('INVALID_INPUT', resolution.reason);
        values.resolution = resolution.value;
        values.completedAt = now;
        // A handler may complete a ticket they did not start; record who did.
        if (!current.handlerId) values.handlerId = principal.id;
      }

      const updated = await repository.updateOne({
        // Optimistic guard: the row must still be in the state we read.
        filter: { id, status: current.status },
        values,
      });
      const result = await repository.findOne({
        filter: { id: updated.record.id },
        select: ticketSelect,
      });
      if (!result) throw new ItTicketError('NOT_FOUND');
      return result as ItTicketRecord;
    });
  }
}

export const itTicketServiceToken = createServiceToken<ItTicketService>(
  'nb3-factory/it-ticket-service',
);

/**
 * Maps a repository failure onto the domain error the route understands. A row
 * the caller may not see is reported as missing, so the API never confirms it
 * exists.
 */
export function mapRepositoryError(error: RepositoryError): ItTicketError {
  switch (error.code) {
    case 'RECORD_NOT_FOUND':
    case 'RECORD_OUTSIDE_SCOPE':
    case 'SCOPE_VIOLATION':
    case 'MULTIPLE_RECORDS_MATCHED':
      return new ItTicketError('NOT_FOUND');
    case 'WRITE_FORBIDDEN':
    case 'READ_FORBIDDEN':
    case 'FIELD_WRITE_FORBIDDEN':
    case 'FIELD_READ_FORBIDDEN':
    case 'POLICY_REQUIRED':
    case 'INVALID_POLICY':
      return new ItTicketError('FORBIDDEN');
    default:
      return new ItTicketError('INVALID_INPUT', error.code);
  }
}
