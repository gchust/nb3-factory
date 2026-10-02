import { createServiceToken } from '@nocobase/service-provider';
import type { DatabaseManager } from '@nocobase/db';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import {
  IT_TICKET_CATEGORIES,
  IT_TICKETS_COLLECTION,
  IT_TICKETS_COMPOSITE,
  type ItTicketCategory,
  type ItTicketRecord,
  type ItTicketStatus,
} from './it-tickets-resources.js';

/** Resolved in the provider and consumed by the HTTP routes. */
export const itTicketsServiceToken =
  createServiceToken<ItTicketsService>('it-tickets-service');

export class ItTicketNotFoundError extends Error {
  constructor() {
    super('Ticket not found');
    this.name = 'ItTicketNotFoundError';
  }
}

export class ItTicketForbiddenError extends Error {
  constructor() {
    super('Not permitted');
    this.name = 'ItTicketForbiddenError';
  }
}

export class ItTicketConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ItTicketConflictError';
  }
}

export class ItTicketValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ItTicketValidationError';
  }
}

interface DirectoryUser {
  id: string;
  name: string | null;
  username: string | null;
}

/** A ticket as the client reads it, with submitter and handler names resolved. */
export interface ItTicketView {
  id: number;
  title: string;
  category: ItTicketCategory;
  description: string | null;
  status: ItTicketStatus;
  resolution: string | null;
  submitterId: string;
  submitterName: string;
  handlerId: string | null;
  handlerName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** True when the caller may start or complete tickets. */
  canHandle: boolean;
}

export interface CreateItTicketInput {
  title: string;
  category: ItTicketCategory;
  description?: string | null;
}

type TicketRow = Partial<ItTicketRecord>;

/**
 * Domain logic for IT repair tickets. The HTTP layer owns status codes; this
 * service owns scoping, transitions and field values, and it never inspects a
 * request object. Every read and write runs under a Repository Policy resolved
 * from the caller's own authorization context, so a row another employee owns
 * is invisible rather than merely hidden by the interface.
 */
export class ItTicketsService {
  constructor(private readonly database: DatabaseManager) {}

  async list(
    context: AuthorizationContext,
    status?: string,
  ): Promise<ItTicketView[]> {
    const policy = await this.collectionPolicy(context, 'view');
    const records = await this.database
      .repository<ItTicketRecord>(IT_TICKETS_COLLECTION)
      .withPolicy(policy)
      .findMany(status ? { filter: { status } } : {});
    return this.decorate(context, records);
  }

  async get(
    context: AuthorizationContext,
    id: number,
  ): Promise<ItTicketView | undefined> {
    const policy = await this.collectionPolicy(context, 'view');
    const record = await this.database
      .repository<ItTicketRecord>(IT_TICKETS_COLLECTION)
      .withPolicy(policy)
      .findOne({ filter: { id } });
    if (!record) return undefined;
    const [view] = await this.decorate(context, [record]);
    return view;
  }

  async create(
    context: AuthorizationContext,
    input: CreateItTicketInput,
  ): Promise<ItTicketView> {
    const title = input.title.trim();
    if (!title) throw new ItTicketValidationError('Title is required');
    if (title.length > 255)
      throw new ItTicketValidationError('Title is too long');
    if (!IT_TICKET_CATEGORIES.includes(input.category)) {
      throw new ItTicketValidationError('Unknown category');
    }

    const policy = await this.collectionPolicy(context, 'create');
    const now = new Date().toISOString();
    const result = await this.database
      .repository<ItTicketRecord>(IT_TICKETS_COLLECTION)
      .withPolicy(policy)
      .createOne({
        values: {
          title,
          category: input.category,
          description: input.description?.trim() || null,
          status: 'pending',
          submitterId: context.identity.principal.id,
          createdAt: now,
          updatedAt: now,
        },
      });
    const [view] = await this.decorate(context, [result.record]);
    return view;
  }

  async start(
    context: AuthorizationContext,
    id: number,
  ): Promise<ItTicketView> {
    const policy = await this.collectionPolicy(context, 'start');
    const repository = this.database
      .repository<ItTicketRecord>(IT_TICKETS_COLLECTION)
      .withPolicy(policy);
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) throw new ItTicketNotFoundError();
    if (existing.status !== 'pending') {
      throw new ItTicketConflictError('Only a pending ticket can be started');
    }
    const now = new Date().toISOString();
    const result = await repository.updateOne({
      filter: { id, status: 'pending' },
      values: {
        status: 'in_progress',
        handlerId: context.identity.principal.id,
        startedAt: now,
        updatedAt: now,
      },
    });
    const [view] = await this.decorate(context, [result.record]);
    return view;
  }

  async complete(
    context: AuthorizationContext,
    id: number,
    resolutionInput: unknown,
  ): Promise<ItTicketView> {
    const resolution =
      typeof resolutionInput === 'string' ? resolutionInput.trim() : '';
    if (!resolution)
      throw new ItTicketValidationError('Resolution is required');

    const policy = await this.collectionPolicy(context, 'complete');
    const repository = this.database
      .repository<ItTicketRecord>(IT_TICKETS_COLLECTION)
      .withPolicy(policy);
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) throw new ItTicketNotFoundError();
    if (existing.status !== 'in_progress') {
      throw new ItTicketConflictError(
        'Only an in-progress ticket can be completed',
      );
    }
    const now = new Date().toISOString();
    const result = await repository.updateOne({
      filter: { id, status: 'in_progress' },
      values: {
        status: 'completed',
        resolution,
        completedAt: now,
        updatedAt: now,
      },
    });
    const [view] = await this.decorate(context, [result.record]);
    return view;
  }

  /** True when the caller may start or complete tickets; used for interface affordances. */
  async canHandle(context: AuthorizationContext): Promise<boolean> {
    const policy = await this.resolvePolicy(context, 'start');
    return Boolean(policy && policy.update !== false);
  }

  private async resolvePolicy(context: AuthorizationContext, action: string) {
    const decision = await context.authorize({
      resource: { type: 'composite', id: IT_TICKETS_COMPOSITE },
      action,
    });
    if (decision.effect === 'deny') return undefined;
    return decision.conditions?.database?.[IT_TICKETS_COLLECTION];
  }

  private async collectionPolicy(
    context: AuthorizationContext,
    action: string,
  ) {
    const policy = await this.resolvePolicy(context, action);
    if (!policy) throw new ItTicketForbiddenError();
    return policy;
  }

  private async decorate(
    context: AuthorizationContext,
    records: readonly TicketRow[],
  ): Promise<ItTicketView[]> {
    if (records.length === 0) return [];
    const ids = new Set<string>();
    for (const record of records) {
      if (record.submitterId) ids.add(record.submitterId);
      if (record.handlerId) ids.add(record.handlerId);
    }
    const idList = [...ids];
    const users = await this.database
      .repository<DirectoryUser>('user')
      .findMany({
        filter: (filter) =>
          filter.or(idList.map((id) => filter.string('id').eq(id))),
        select: (select) => select.fields('id', 'name', 'username'),
      });
    const names = new Map<string, string>();
    for (const user of users) {
      names.set(user.id, user.name || user.username || user.id);
    }
    const canHandle = await this.canHandle(context);
    return records.map((record) => {
      const submitterId = record.submitterId ?? '';
      const handlerId = record.handlerId ?? null;
      return {
        id: record.id ?? 0,
        title: record.title ?? '',
        category: record.category ?? 'other',
        description: record.description ?? null,
        status: record.status ?? 'pending',
        resolution: record.resolution ?? null,
        submitterId,
        submitterName: names.get(submitterId) ?? submitterId,
        handlerId,
        handlerName: handlerId ? (names.get(handlerId) ?? handlerId) : null,
        startedAt: record.startedAt ?? null,
        completedAt: record.completedAt ?? null,
        createdAt: record.createdAt ?? '',
        updatedAt: record.updatedAt ?? '',
        canHandle,
      };
    });
  }
}
