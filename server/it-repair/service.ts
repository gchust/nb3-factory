import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import {
  RepositoryError,
  type DatabaseManager,
  type RepositoryPolicy,
  type ScopedRepository,
} from '@nocobase/db';

import {
  REPAIR_TICKET_COLLECTION,
  REPAIR_TICKET_RESOURCE_ID,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  type RepairTicketRow,
  type TicketCategory,
  type TicketStatus,
} from './declarations.js';

/** The ticket as the API and the page consume it. */
export interface RepairTicketView {
  id: number;
  title: string;
  category: TicketCategory;
  description: string | null;
  status: TicketStatus;
  resolution: string | null;
  submittedById: string;
  submittedByName: string;
  handlerId: string | null;
  handlerName: string | null;
  processingAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Whether the caller may move this ticket from `pending` to `processing`. */
  canStart: boolean;
  /** Whether the caller may move this ticket from `processing` to `completed`. */
  canComplete: boolean;
}

/** The identity that submits or handles a ticket. */
export interface TicketActor {
  id: string;
  name: string;
}

export interface CreateTicketInput {
  title: string;
  category: string;
  description?: string | null;
}

export interface TicketListFilter {
  status?: string;
}

export interface TicketCapabilities {
  create: boolean;
  /** Whether the caller may process tickets at all, regardless of their state. */
  process: boolean;
}

const STATUS_LABELS: readonly TicketStatus[] = TICKET_STATUSES;
const CATEGORY_LABELS: readonly TicketCategory[] = TICKET_CATEGORIES;
const MAX_TITLE_LENGTH = 255;
const MAX_TEXT_LENGTH = 5000;

/** Invalid input, mapped to 400 by the route. */
export class RepairTicketValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'RepairTicketValidationError';
    this.field = field;
  }
}

/** A ticket the caller may not see, mapped to 404 so its existence is not disclosed. */
export class RepairTicketNotFoundError extends Error {
  constructor() {
    super('Repair ticket not found');
    this.name = 'RepairTicketNotFoundError';
  }
}

/** The caller may not perform the operation, mapped to 403. */
export class RepairTicketForbiddenError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(`Not allowed to ${operation} this repair ticket`);
    this.name = 'RepairTicketForbiddenError';
    this.operation = operation;
  }
}

/** A state transition the workflow does not allow, mapped to 409. */
export class RepairTicketConflictError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = 'RepairTicketConflictError';
    this.reason = reason;
  }
}

type TicketOperation = 'view' | 'create' | 'start' | 'complete';

/**
 * Business rules for IT repair tickets.
 *
 * Access is decided by the authorization snapshot the request already carries;
 * this service only translates a denied composite action into an error and then
 * runs the repository under the Policy the same decision returned. It never
 * reads an HTTP context or picks a status code.
 */
export class RepairTicketService {
  constructor(private readonly database: DatabaseManager) {}

  async capabilities(authz: AuthorizationContext): Promise<TicketCapabilities> {
    const [create, process] = await Promise.all([
      authz.can(this.check('create')),
      authz.can(this.check('start')),
    ]);
    return { create, process };
  }

  async list(
    authz: AuthorizationContext,
    actor: TicketActor,
    filter: TicketListFilter = {},
  ): Promise<RepairTicketView[]> {
    const repository = await this.repositoryFor(authz, 'view');
    const canProcess = await authz.can(this.check('start'));
    const rows = await repository.findMany({
      ...(filter.status ? { filter: { status: filter.status } } : {}),
      sort: (sort) => sort.field('createdAt').desc(),
      limit: 500,
    });
    return rows.map((row) => toView(row, actor.id, canProcess));
  }

  async get(
    authz: AuthorizationContext,
    actor: TicketActor,
    id: number,
  ): Promise<RepairTicketView> {
    const repository = await this.repositoryFor(authz, 'view');
    const canProcess = await authz.can(this.check('start'));
    const row = await repository.findOne({ filter: { id } });
    if (!row) throw new RepairTicketNotFoundError();
    return toView(row, actor.id, canProcess);
  }

  async create(
    authz: AuthorizationContext,
    actor: TicketActor,
    input: CreateTicketInput,
  ): Promise<RepairTicketView> {
    const title = requireText(input.title, 'title', MAX_TITLE_LENGTH);
    const category = requireCategory(input.category);
    const description =
      input.description === undefined || input.description === null
        ? null
        : optionalText(input.description, 'description', MAX_TEXT_LENGTH);
    const repository = await this.repositoryFor(authz, 'create');
    const now = new Date();
    const { record } = await repository.createOne({
      values: {
        title,
        category,
        description,
        status: 'pending',
        submittedById: actor.id,
        submittedByName: actor.name,
        createdAt: now,
        updatedAt: now,
      },
    });
    return toView(record, actor.id, false);
  }

  async start(
    authz: AuthorizationContext,
    actor: TicketActor,
    id: number,
  ): Promise<RepairTicketView> {
    const repository = await this.repositoryFor(authz, 'start');
    const row = await repository.findOne({ filter: { id } });
    if (!row) throw new RepairTicketNotFoundError();
    const status = row.status as TicketStatus;
    if (status === 'completed') {
      throw new RepairTicketConflictError(
        'completed',
        'A completed ticket cannot be started again',
      );
    }
    if (status !== 'pending') {
      throw new RepairTicketConflictError(
        'already-processing',
        'Only a pending ticket can be started',
      );
    }
    const result = await this.update(repository, id, 'pending', {
      status: 'processing',
      handlerId: actor.id,
      handlerName: actor.name,
      processingAt: new Date(),
    });
    return toView(result, actor.id, true);
  }

  async complete(
    authz: AuthorizationContext,
    actor: TicketActor,
    id: number,
    resolution: string,
  ): Promise<RepairTicketView> {
    const note = requireText(resolution, 'resolution', MAX_TEXT_LENGTH);
    const repository = await this.repositoryFor(authz, 'complete');
    const row = await repository.findOne({ filter: { id } });
    if (!row) throw new RepairTicketNotFoundError();
    const status = row.status as TicketStatus;
    if (status === 'completed') {
      throw new RepairTicketConflictError(
        'completed',
        'A completed ticket cannot be completed again',
      );
    }
    if (status !== 'processing') {
      throw new RepairTicketConflictError(
        'not-processing',
        'A ticket must be started before it can be completed',
      );
    }
    if (row.handlerId !== actor.id) {
      throw new RepairTicketForbiddenError('complete');
    }
    const result = await this.update(repository, id, 'processing', {
      status: 'completed',
      resolution: note,
      completedAt: new Date(),
    });
    return toView(result, actor.id, true);
  }

  private check(action: TicketOperation) {
    return {
      resource: { type: 'composite' as const, id: REPAIR_TICKET_RESOURCE_ID },
      action,
    };
  }

  /** The scoped repository for one composite action, or a denial. */
  private async repositoryFor(
    authz: AuthorizationContext,
    action: TicketOperation,
  ): Promise<ScopedRepository<RepairTicketRow>> {
    const decision = await authz.authorize(this.check(action));
    if (decision.effect === 'deny') {
      throw new RepairTicketForbiddenError(action);
    }
    const database = (
      decision.conditions as
        | { database?: Record<string, RepositoryPolicy<RepairTicketRow>> }
        | undefined
    )?.database;
    const policy = database?.[REPAIR_TICKET_COLLECTION];
    if (!policy) {
      throw new Error(
        `Authorization for "${action}" did not return a ${REPAIR_TICKET_COLLECTION} policy`,
      );
    }
    return this.database
      .repository<RepairTicketRow>(REPAIR_TICKET_COLLECTION)
      .withPolicy(policy) as unknown as ScopedRepository<RepairTicketRow>;
  }

  /**
   * Applies a transition only when the ticket is still in the state the caller
   * observed, so two simultaneous requests cannot both advance it.
   */
  private async update(
    repository: ScopedRepository<RepairTicketRow>,
    id: number,
    expectedStatus: TicketStatus,
    values: Partial<RepairTicketRow>,
  ): Promise<Partial<RepairTicketRow>> {
    try {
      const { record } = await repository.updateOne({
        filter: { id, status: expectedStatus },
        values: { ...values, updatedAt: new Date() },
      });
      return record;
    } catch (error) {
      if (isRepositoryError(error, 'RECORD_NOT_FOUND')) {
        throw new RepairTicketConflictError(
          'state-changed',
          'The ticket changed while this request was being handled',
        );
      }
      throw error;
    }
  }
}

function isRepositoryError(error: unknown, code: string): boolean {
  return error instanceof RepositoryError && error.code === code;
}

function toView(
  row: Partial<RepairTicketRow>,
  actorId: string,
  canProcess: boolean,
): RepairTicketView {
  const status = (row.status ?? 'pending') as TicketStatus;
  return {
    id: Number(row.id),
    title: row.title ?? '',
    category: (row.category ?? 'other') as TicketCategory,
    description: row.description ?? null,
    status,
    resolution: row.resolution ?? null,
    submittedById: row.submittedById ?? '',
    submittedByName: row.submittedByName ?? '',
    handlerId: row.handlerId ?? null,
    handlerName: row.handlerName ?? null,
    processingAt: toIso(row.processingAt ?? null),
    completedAt: toIso(row.completedAt ?? null),
    createdAt: toIso(row.createdAt ?? null) ?? '',
    updatedAt: toIso(row.updatedAt ?? null) ?? '',
    canStart: canProcess && status === 'pending',
    canComplete:
      canProcess &&
      status === 'processing' &&
      row.handlerId !== null &&
      row.handlerId !== undefined &&
      row.handlerId === actorId,
  };
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RepairTicketValidationError(field, `${field} is required`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new RepairTicketValidationError(
      field,
      `${field} must be at most ${max} characters`,
    );
  }
  return text;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new RepairTicketValidationError(field, `${field} must be a string`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new RepairTicketValidationError(
      field,
      `${field} must be at most ${max} characters`,
    );
  }
  return text;
}

function requireCategory(value: unknown): TicketCategory {
  if (
    typeof value !== 'string' ||
    !CATEGORY_LABELS.includes(value as TicketCategory)
  ) {
    throw new RepairTicketValidationError(
      'category',
      `category must be one of ${CATEGORY_LABELS.join(', ')}`,
    );
  }
  return value as TicketCategory;
}

export { STATUS_LABELS };
