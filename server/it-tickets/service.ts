import type { AuthorizationContext } from '@nocobase/authorization/core';
import { type DatabaseManager, type RepositoryPolicy } from '@nocobase/db';
import { IT_TICKETS_COLLECTION } from './record-access.js';
import {
  IT_TICKETS_RESOURCE,
  type ItTicketRow,
  type ItTicketsAction,
} from './resources.js';

/** The only categories a request may be filed under. */
export const IT_TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type ItTicketCategory = (typeof IT_TICKET_CATEGORIES)[number];

/** The only statuses a request moves through. */
export const IT_TICKET_STATUSES = [
  'pending',
  'processing',
  'completed',
] as const;
export type ItTicketStatus = (typeof IT_TICKET_STATUSES)[number];

const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 20_000;
const MAX_RESOLUTION_LENGTH = 20_000;
const LIST_LIMIT = 200;

/**
 * A repair-request failure described in domain terms.
 *
 * The route decides which HTTP status each code answers with; nothing here
 * reads a request or writes a response.
 */
export type ItTicketsErrorCode =
  'FORBIDDEN' | 'TICKET_NOT_FOUND' | 'INVALID_INPUT' | 'INVALID_STATE';

export class ItTicketsError extends Error {
  constructor(
    readonly code: ItTicketsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ItTicketsError';
  }
}

/** A request as the client receives it. */
export interface ItTicketView {
  id: number;
  title: string;
  category: ItTicketCategory;
  description: string;
  status: ItTicketStatus;
  submitterId: string;
  submitterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  resolution: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Whether the caller may start this request right now. */
  canStart: boolean;
  /** Whether the caller may complete this request right now. */
  canComplete: boolean;
}

export interface ItTicketsListResult {
  /** The requests matching the requested status, newest first. */
  data: ItTicketView[];
  /**
   * How many requests this caller may see in each state.
   *
   * Counted over the same in-scope set the list reads, so a tab never claims
   * more requests than the caller is allowed to open.
   */
  counts: Record<ItTicketStatus, number>;
  /** Whether the caller may file a new request. */
  canCreate: boolean;
}

export interface CreateItTicketInput {
  title: unknown;
  category: unknown;
  description: unknown;
}

/**
 * The Repository Policy of one business action, or `undefined` when the action
 * is denied for this identity.
 *
 * A composite decision is `deny` with no conditions when the identity holds no
 * grant for the action; a matched grant produces one policy per composed
 * collection. Only this action's grants contribute to the policy, so a grant
 * for a different action cannot widen this one.
 */
async function resolvePolicy(
  authorization: AuthorizationContext,
  action: ItTicketsAction,
): Promise<RepositoryPolicy<ItTicketRow> | undefined> {
  const decision = await authorization.authorize({
    resource: { type: 'composite', id: IT_TICKETS_RESOURCE },
    action,
  });
  if (decision.effect === 'deny') {
    return undefined;
  }
  const database = decision.conditions?.database;
  return database?.[IT_TICKETS_COLLECTION];
}

function repositoryFor(
  database: DatabaseManager,
  policy: RepositoryPolicy<ItTicketRow>,
) {
  return database
    .repository<ItTicketRow>(IT_TICKETS_COLLECTION)
    .withPolicy(policy);
}

/** Already cast: a bound Repository narrows each field to `Partial`. */
async function readRows(
  database: DatabaseManager,
  policy: RepositoryPolicy<ItTicketRow>,
): Promise<ItTicketRow[]> {
  const repository = repositoryFor(database, policy);
  const rows = await repository.findMany({
    sort: (sort) => [sort.field('createdAt').desc(), sort.field('id').desc()],
    limit: LIST_LIMIT,
  });
  return rows as ItTicketRow[];
}

/**
 * The identifiers of the requests in scope for one action and status.
 *
 * Reading the scope instead of trusting a status is what makes "may this
 * person start it" and "is it startable" the same question the server already
 * answers for the write itself.
 */
async function scopedIds(
  database: DatabaseManager,
  policy: RepositoryPolicy<ItTicketRow>,
  status: ItTicketStatus,
): Promise<Set<number>> {
  const repository = repositoryFor(database, policy);
  const rows = await repository.findMany({ filter: { status } });
  return new Set((rows as ItTicketRow[]).map((row) => row.id));
}

async function resolveUserNames(
  database: DatabaseManager,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await database
    .query()
    .selectFrom('user')
    .select(['id', 'name', 'username'])
    .where('id', 'in', unique)
    .execute();
  const names = new Map<string, string>();
  for (const row of rows) {
    const id = String(row.id);
    const name = typeof row.name === 'string' ? row.name : undefined;
    const username =
      typeof row.username === 'string' ? row.username : undefined;
    if (name || username) {
      names.set(id, name ?? username ?? id);
    }
  }
  return names;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function asCategory(value: unknown): ItTicketCategory {
  return typeof value === 'string' &&
    (IT_TICKET_CATEGORIES as readonly string[]).includes(value)
    ? (value as ItTicketCategory)
    : 'other';
}

function asStatus(value: unknown): ItTicketStatus {
  return typeof value === 'string' &&
    (IT_TICKET_STATUSES as readonly string[]).includes(value)
    ? (value as ItTicketStatus)
    : 'pending';
}

function toView(
  row: ItTicketRow,
  canStart: boolean,
  canComplete: boolean,
  names: Map<string, string>,
): ItTicketView {
  return {
    id: row.id,
    title: row.title,
    category: asCategory(row.category),
    description: row.description ?? '',
    status: asStatus(row.status),
    submitterId: row.submitterId,
    submitterName: names.get(row.submitterId) ?? null,
    assigneeId: row.assigneeId ?? null,
    assigneeName: row.assigneeId ? (names.get(row.assigneeId) ?? null) : null,
    resolution: row.resolution ?? null,
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    canStart,
    canComplete,
  };
}

/**
 * Renders rows that the caller is already authorized to see, adding the
 * per-row actions the caller may take next.
 */
async function render(
  database: DatabaseManager,
  authorization: AuthorizationContext,
  rows: ItTicketRow[],
): Promise<ItTicketView[]> {
  const [startPolicy, completePolicy] = await Promise.all([
    resolvePolicy(authorization, 'start'),
    resolvePolicy(authorization, 'complete'),
  ]);
  const [startableIds, completableIds] = await Promise.all([
    startPolicy
      ? scopedIds(database, startPolicy, 'pending')
      : Promise.resolve(new Set<number>()),
    completePolicy
      ? scopedIds(database, completePolicy, 'processing')
      : Promise.resolve(new Set<number>()),
  ]);
  const names = await resolveUserNames(
    database,
    rows.flatMap((row) =>
      row.assigneeId ? [row.submitterId, row.assigneeId] : [row.submitterId],
    ),
  );
  return rows.map((row) =>
    toView(row, startableIds.has(row.id), completableIds.has(row.id), names),
  );
}

export function parseTicketId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ItTicketsError('TICKET_NOT_FOUND', 'No such repair request.');
  }
  return id;
}

export function parseStatusFilter(
  value: string | undefined,
): ItTicketStatus | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (!(IT_TICKET_STATUSES as readonly string[]).includes(value)) {
    throw new ItTicketsError('INVALID_INPUT', 'Unknown status filter.');
  }
  return value as ItTicketStatus;
}

/**
 * Lists the requests this identity may see, optionally limited to one status.
 *
 * The status filter is applied to the already-authorized rows, and the counts
 * describe the whole of that set, so switching tabs changes which requests are
 * listed without changing what the caller is allowed to see. `canCreate` is
 * what the client uses to decide whether to offer a new-request form; the
 * server enforces the same action again on submit.
 */
export async function listItTickets(
  database: DatabaseManager,
  authorization: AuthorizationContext,
  status?: ItTicketStatus,
): Promise<ItTicketsListResult> {
  const viewPolicy = await resolvePolicy(authorization, 'view');
  if (!viewPolicy) {
    throw new ItTicketsError('FORBIDDEN', 'You cannot view repair requests.');
  }
  const createPolicy = await resolvePolicy(authorization, 'create');
  const rows = await readRows(database, viewPolicy);
  const counts: Record<ItTicketStatus, number> = {
    pending: 0,
    processing: 0,
    completed: 0,
  };
  for (const row of rows) {
    counts[asStatus(row.status)] += 1;
  }
  const visible =
    status === undefined ? rows : rows.filter((row) => row.status === status);
  return {
    data: await render(database, authorization, visible),
    counts,
    canCreate: createPolicy !== undefined,
  };
}

/** Reads one request, refusing to disclose that a hidden request exists. */
export async function getItTicket(
  database: DatabaseManager,
  authorization: AuthorizationContext,
  id: number,
): Promise<ItTicketView> {
  const viewPolicy = await resolvePolicy(authorization, 'view');
  if (!viewPolicy) {
    throw new ItTicketsError('FORBIDDEN', 'You cannot view repair requests.');
  }
  const repository = repositoryFor(database, viewPolicy);
  const row = (await repository.findOne({ filter: { id } })) as
    ItTicketRow | undefined;
  if (!row) {
    throw new ItTicketsError('TICKET_NOT_FOUND', 'No such repair request.');
  }
  const [view] = await render(database, authorization, [row]);
  return view;
}

function requireText(
  value: unknown,
  field: string,
  maxLength: number,
  { required }: { required: boolean },
): string {
  if (value === undefined || value === null) {
    if (required) {
      throw new ItTicketsError('INVALID_INPUT', `${field} is required.`);
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw new ItTicketsError('INVALID_INPUT', `${field} must be text.`);
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new ItTicketsError('INVALID_INPUT', `${field} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw new ItTicketsError('INVALID_INPUT', `${field} is too long.`);
  }
  return trimmed;
}

/**
 * Creates a request for the signed-in person.
 *
 * `submitterId` and `status` are written from the server, never from the
 * request body, so a caller cannot file in someone else's name or open a
 * request in a state other than `pending`.
 */
export async function createItTicket(
  database: DatabaseManager,
  authorization: AuthorizationContext,
  input: CreateItTicketInput,
): Promise<ItTicketView> {
  const createPolicy = await resolvePolicy(authorization, 'create');
  if (!createPolicy) {
    throw new ItTicketsError('FORBIDDEN', 'You cannot submit repair requests.');
  }
  const title = requireText(input.title, 'Title', MAX_TITLE_LENGTH, {
    required: true,
  });
  const category = input.category;
  if (!(IT_TICKET_CATEGORIES as readonly string[]).includes(String(category))) {
    throw new ItTicketsError('INVALID_INPUT', 'Choose a valid category.');
  }
  // Only the title is required. A description is expected but a short request
  // that names the problem in the title is still a request.
  const description = requireText(
    input.description,
    'Description',
    MAX_DESCRIPTION_LENGTH,
    { required: false },
  );
  const now = new Date();
  const repository = repositoryFor(database, createPolicy);
  const created = await repository.createOne({
    values: {
      title,
      category: category as ItTicketCategory,
      description,
      status: 'pending',
      submitterId: authorization.identity.principal.id,
      createdAt: now,
      updatedAt: now,
    },
  });
  const [view] = await render(database, authorization, [
    created.record as ItTicketRow,
  ]);
  return view;
}

/**
 * Moves a pending request into handling and records the handler.
 *
 * The status is part of the update predicate, so two people racing to start
 * the same request cannot both succeed.
 */
export async function startItTicket(
  database: DatabaseManager,
  authorization: AuthorizationContext,
  id: number,
): Promise<ItTicketView> {
  const startPolicy = await resolvePolicy(authorization, 'start');
  if (!startPolicy) {
    throw new ItTicketsError('FORBIDDEN', 'You cannot start repair requests.');
  }
  const repository = repositoryFor(database, startPolicy);
  const current = (await repository.findOne({ filter: { id } })) as
    ItTicketRow | undefined;
  if (!current) {
    throw new ItTicketsError('TICKET_NOT_FOUND', 'No such repair request.');
  }
  if (current.status !== 'pending') {
    throw new ItTicketsError(
      'INVALID_STATE',
      'Only a pending request can be started.',
    );
  }
  const now = new Date();
  const updated = await repository.updateOne({
    filter: { id, status: 'pending' },
    values: {
      status: 'processing',
      assigneeId: authorization.identity.principal.id,
      startedAt: now,
      updatedAt: now,
    },
  });
  const [view] = await render(database, authorization, [
    updated.record as ItTicketRow,
  ]);
  return view;
}

/**
 * Completes a request that is being handled, requiring a resolution note.
 *
 * A completed request is terminal: the status predicate makes a second
 * completion fail instead of overwriting the first result.
 */
export async function completeItTicket(
  database: DatabaseManager,
  authorization: AuthorizationContext,
  id: number,
  resolutionInput: unknown,
): Promise<ItTicketView> {
  const completePolicy = await resolvePolicy(authorization, 'complete');
  if (!completePolicy) {
    throw new ItTicketsError(
      'FORBIDDEN',
      'You cannot complete repair requests.',
    );
  }
  const resolution = requireText(
    resolutionInput,
    'Resolution',
    MAX_RESOLUTION_LENGTH,
    { required: true },
  );
  const repository = repositoryFor(database, completePolicy);
  const current = (await repository.findOne({ filter: { id } })) as
    ItTicketRow | undefined;
  if (!current) {
    throw new ItTicketsError('TICKET_NOT_FOUND', 'No such repair request.');
  }
  if (current.status !== 'processing') {
    throw new ItTicketsError(
      'INVALID_STATE',
      'Only a request in handling can be completed.',
    );
  }
  const now = new Date();
  const updated = await repository.updateOne({
    filter: { id, status: 'processing' },
    values: {
      status: 'completed',
      resolution,
      completedAt: now,
      updatedAt: now,
    },
  });
  const [view] = await render(database, authorization, [
    updated.record as ItTicketRow,
  ]);
  return view;
}
