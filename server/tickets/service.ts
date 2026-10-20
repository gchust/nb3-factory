import type { DatabaseConnection } from '@nocobase/db';
import type { JsonObject } from '@nocobase/lifecycle';
import type {
  EffectRun,
  LifecycleRuntime,
  RecordHistory,
  TransitionEntry,
} from '@nocobase/lifecycle';
import { SYSTEM_ACTOR } from '@nocobase/lifecycle';
import type { FilterBuilder, RepositoryPolicy } from '@nocobase/db';
import type { AuthorizationDecision } from '@nocobase/authorization';
import { AppI18nError } from '@nocobase/i18n/server';
import type {
  TicketCategory,
  TicketPriority,
  TicketRecord,
  TicketState,
} from './types.js';
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from './types.js';

export interface TicketListInput {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: TicketState;
  readonly category?: TicketCategory;
  readonly priority?: TicketPriority;
  readonly keyword?: string;
}

export interface TicketListResult {
  readonly items: TicketRecord[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface TicketDashboardSummary {
  readonly total: number;
  readonly active: number;
  readonly pending: number;
  readonly processing: number;
  readonly escalated: number;
  readonly resolved: number;
  readonly closed: number;
  readonly cancelled: number;
  readonly unassigned: number;
  readonly overdue: number;
}

export interface TicketWorkload {
  readonly id: string;
  readonly active: number;
  readonly escalated: number;
}

export interface TicketDashboard {
  readonly summary: TicketDashboardSummary;
  readonly unassigned: TicketRecord[];
  readonly overdue: TicketRecord[];
  readonly workload: TicketWorkload[];
}

/** A ticket the desk still has to act on. Escalated tickets always qualify. */
export const ticketIsOverdue = (
  ticket: Pick<TicketRecord, 'status' | 'statusChangedAt'>,
  now: Date,
  overdueHours = 24,
): boolean => {
  if (ticket.status === 'escalated') return true;
  if (ticket.status !== 'pending' && ticket.status !== 'processing') {
    return false;
  }
  const changedAt = new Date(ticket.statusChangedAt).getTime();
  return Number.isFinite(changedAt)
    ? changedAt < now.getTime() - overdueHours * 60 * 60 * 1000
    : false;
};

/** The dashboard numbers, kept separate so the overdue rule is testable. */
export function summarizeTickets(
  rows: readonly TicketRecord[],
  now = new Date(),
): TicketDashboard {
  const counts = {
    pending: 0,
    processing: 0,
    escalated: 0,
    resolved: 0,
    closed: 0,
    cancelled: 0,
  } satisfies Record<TicketState, number>;
  const workload = new Map<string, { active: number; escalated: number }>();
  let unassigned = 0;
  let overdue = 0;

  for (const ticket of rows) {
    counts[ticket.status] += 1;
    if (ticket.status === 'pending' && !ticket.assigneeId) unassigned += 1;
    if (ticketIsOverdue(ticket, now)) overdue += 1;
    if (
      ticket.status === 'pending' ||
      ticket.status === 'processing' ||
      ticket.status === 'escalated'
    ) {
      if (ticket.assigneeId) {
        const current = workload.get(ticket.assigneeId) ?? {
          active: 0,
          escalated: 0,
        };
        current.active += 1;
        if (ticket.status === 'escalated') current.escalated += 1;
        workload.set(ticket.assigneeId, current);
      }
    }
  }

  return {
    summary: {
      total: rows.length,
      active: counts.pending + counts.processing + counts.escalated,
      ...counts,
      unassigned,
      overdue,
    },
    unassigned: rows
      .filter((ticket) => ticket.status === 'pending' && !ticket.assigneeId)
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      )
      .slice(0, 5),
    overdue: rows
      .filter((ticket) => ticketIsOverdue(ticket, now))
      .sort(
        (left, right) =>
          new Date(left.statusChangedAt).getTime() -
          new Date(right.statusChangedAt).getTime(),
      )
      .slice(0, 5),
    workload: [...workload.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((left, right) => right.active - left.active),
  };
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly category: TicketCategory;
  readonly priority: TicketPriority;
  readonly attachmentIds?: readonly string[];
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  attachmentId: string;
  createdAt: Date;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export interface TicketFile {
  id: string;
  ownerId: string | null;
  filename: string;
  ext: string;
  mimeType: string;
  size: string | number;
  createdAt: Date;
  updatedAt: Date;
  contentUrl?: string;
}

export interface TicketDetail extends TicketRecord {
  comments: TicketComment[];
  attachments: TicketAttachment[];
  files: TicketFile[];
}

export type TicketRepositoryPolicy = RepositoryPolicy | true;

const NS = 'nb3-factory';

const ticketError = (code: string, key: string, status = 400): AppI18nError =>
  new AppI18nError(code, {
    ns: NS,
    key: `helpdesk.errors.${key}`,
    status,
  });

const policyFromDecision = (
  decision: AuthorizationDecision,
  collection = 'tickets',
): TicketRepositoryPolicy => {
  if (decision.effect === 'deny') {
    throw new Error('Authorization denied.');
  }
  const database = decision.conditions?.database as
    Record<string, RepositoryPolicy> | undefined;
  return database?.[collection] ?? true;
};

export const ticketPolicyFor = (
  decision: AuthorizationDecision,
  collection = 'tickets',
): TicketRepositoryPolicy => policyFromDecision(decision, collection);

const isSafeTicketCategory = (value: unknown): value is TicketCategory =>
  typeof value === 'string' &&
  (TICKET_CATEGORIES as readonly string[]).includes(value);

const isSafeTicketPriority = (value: unknown): value is TicketPriority =>
  typeof value === 'string' &&
  (TICKET_PRIORITIES as readonly string[]).includes(value);

const ticketNo = (now: Date): string => {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = crypto
    .randomUUID()
    .replaceAll('-', '')
    .slice(0, 6)
    .toUpperCase();
  return `TK-${day}-${suffix}`;
};

export class TicketService {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly runtime: LifecycleRuntime,
  ) {}

  private tickets(policy: TicketRepositoryPolicy = true) {
    const repository = this.database.repository<TicketRecord>('tickets');
    return policy === true ? repository : repository.withPolicy(policy);
  }

  async list(
    policy: TicketRepositoryPolicy,
    input: TicketListInput,
  ): Promise<TicketListResult> {
    const repo = this.tickets(policy);
    const filter = (f: FilterBuilder<TicketRecord>) => {
      const parts = [
        ...(input.status ? [f.string('status').eq(input.status)] : []),
        ...(input.category ? [f.string('category').eq(input.category)] : []),
        ...(input.priority ? [f.string('priority').eq(input.priority)] : []),
        ...(input.keyword
          ? [
              f.or([
                f.string('ticketNo').includes(input.keyword),
                f.string('title').includes(input.keyword),
              ]),
            ]
          : []),
      ];
      return parts.length > 0 ? f.and(parts) : f.and([]);
    };

    const [items, total] = await Promise.all([
      repo.findMany({
        filter,
        sort: (sort) => [
          sort.field('updatedAt').desc(),
          sort.field('id').desc(),
        ],
        limit: input.pageSize,
        offset: (input.page - 1) * input.pageSize,
      }),
      repo.count({ filter }),
    ]);

    return {
      items: items as TicketRecord[],
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async dashboard(policy: TicketRepositoryPolicy): Promise<TicketDashboard> {
    // The dashboard is a projection of the rows this person may read. Keeping
    // the same repository policy as the list is what scopes an employee to
    // their own tickets and a service desk member to the whole desk.
    const rows = await this.tickets(policy).findMany({});
    return summarizeTickets(rows as TicketRecord[]);
  }

  async requireTicket(
    policy: TicketRepositoryPolicy,
    id: string,
  ): Promise<TicketRecord | undefined> {
    const row = await this.tickets(policy).findOne({
      filter: { id },
    });
    return (row as TicketRecord | undefined) ?? undefined;
  }

  async detail(
    policy: TicketRepositoryPolicy,
    id: string,
  ): Promise<TicketDetail | undefined> {
    const ticket = await this.requireTicket(policy, id);
    if (!ticket) return undefined;

    const [comments, attachments] = await Promise.all([
      this.database.repository<TicketComment>('ticketComments').findMany({
        filter: { ticketId: id },
        sort: (sort) => sort.field('createdAt').asc(),
      }),
      this.database.repository<TicketAttachment>('ticketAttachments').findMany({
        filter: { ticketId: id },
        sort: (sort) => sort.field('createdAt').asc(),
      }),
    ]);

    const fileIds = [...new Set(attachments.map((item) => item.attachmentId))];
    const files =
      fileIds.length === 0
        ? []
        : await this.database.repository<TicketFile>('ticket_files').findMany({
            filter: (filter) =>
              filter.or(fileIds.map((id) => filter.string('id').eq(id))),
          });

    return {
      ...ticket,
      comments: comments,
      attachments: attachments,
      files: files,
    };
  }

  async create(
    actorId: string,
    input: CreateTicketInput,
  ): Promise<TicketRecord> {
    if (
      input.title.trim().length === 0 ||
      input.description.trim().length === 0
    ) {
      throw ticketError('TICKET_TITLE_REQUIRED', 'titleAndDescriptionRequired');
    }
    if (!isSafeTicketCategory(input.category)) {
      throw ticketError('TICKET_CATEGORY_INVALID', 'unknownCategory');
    }
    if (!isSafeTicketPriority(input.priority)) {
      throw ticketError('TICKET_PRIORITY_INVALID', 'unknownPriority');
    }

    const now = new Date();
    const id = crypto.randomUUID();
    const attachmentIds = [...new Set(input.attachmentIds ?? [])];

    if (attachmentIds.length > 0) {
      const files = await this.database.repository('ticket_files').findMany({
        filter: (f) =>
          f.and([
            f.string('ownerId').eq(actorId),
            f.or(attachmentIds.map((fileId) => f.string('id').eq(fileId))),
          ]),
      });
      if (files.length !== attachmentIds.length) {
        throw ticketError(
          'TICKET_ATTACHMENT_UNAVAILABLE',
          'attachmentUnavailable',
        );
      }
    }

    const result = await this.runtime.transaction(async (tx) => {
      const created = await tx.create(
        'tickets',
        {
          id,
          ticketNo: ticketNo(now),
          title: input.title.trim(),
          description: input.description.trim(),
          category: input.category,
          priority: input.priority,
          requesterId: actorId,
          assigneeId: null,
          resolution: null,
          closeNote: null,
          cancelReason: null,
          resolvedAt: null,
          closedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          actor: { id: actorId },
          input: {
            title: input.title.trim(),
            category: input.category,
            priority: input.priority,
          },
        },
      );

      if (attachmentIds.length > 0) {
        const transaction = tx.handle as DatabaseConnection;
        const links =
          transaction.repository<TicketAttachment>('ticketAttachments');
        for (const attachmentId of attachmentIds) {
          await links.createOne({
            values: {
              id: crypto.randomUUID(),
              ticketId: id,
              attachmentId,
              createdAt: now,
            },
          });
        }
      }

      return created.record as TicketRecord;
    });

    return result;
  }

  async fire(
    id: string,
    transition: string,
    actorId: string,
    input: JsonObject = {},
    requestId?: string,
    expectedVersion?: number,
  ): Promise<TicketRecord> {
    const result = await this.runtime.fire('tickets', id, transition, {
      manual: true,
      actor: { id: actorId },
      input,
      ...(requestId ? { requestId } : {}),
      ...(expectedVersion === undefined
        ? {}
        : { expect: { version: expectedVersion } }),
    });
    return result.record as TicketRecord;
  }

  async addComment(
    ticketId: string,
    authorId: string,
    body: string,
  ): Promise<TicketComment> {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw ticketError('TICKET_COMMENT_REQUIRED', 'commentRequired');
    }

    const now = new Date();
    const comment = await this.database
      .repository<TicketComment>('ticketComments')
      .createOne({
        values: {
          id: crypto.randomUUID(),
          ticketId,
          authorId,
          body: trimmed,
          createdAt: now,
        },
      });

    const ticket = await this.database
      .repository<TicketRecord>('tickets')
      .findOne({ filter: { id: ticketId } });
    if (ticket?.status === 'processing') {
      await this.runtime.fire('tickets', ticketId, 'touch', {
        actor: SYSTEM_ACTOR,
        input: { commentId: comment.record.id },
      });
    }

    return comment.record;
  }

  async linkAttachments(
    ticketId: string,
    actorId: string,
    attachmentIds: readonly string[],
  ): Promise<TicketAttachment[]> {
    const unique = [...new Set(attachmentIds)];
    if (unique.length === 0) return [];

    const files = await this.database.repository('ticket_files').findMany({
      filter: (f) =>
        f.and([
          f.string('ownerId').eq(actorId),
          f.or(unique.map((fileId) => f.string('id').eq(fileId))),
        ]),
    });
    if (files.length !== unique.length) {
      throw ticketError(
        'TICKET_ATTACHMENT_UNAVAILABLE',
        'attachmentUnavailable',
      );
    }

    const existing = await this.database
      .repository<TicketAttachment>('ticketAttachments')
      .findMany({
        filter: (f) =>
          f.and([
            f.string('ticketId').eq(ticketId),
            f.or(unique.map((fileId) => f.string('attachmentId').eq(fileId))),
          ]),
      });
    const alreadyLinked = new Set(existing.map((item) => item.attachmentId));
    const missing = unique.filter((fileId) => !alreadyLinked.has(fileId));
    if (missing.length === 0) return existing;

    const now = new Date();
    const links =
      this.database.repository<TicketAttachment>('ticketAttachments');
    for (const attachmentId of missing) {
      await links.createOne({
        values: {
          id: crypto.randomUUID(),
          ticketId,
          attachmentId,
          createdAt: now,
        },
      });
    }

    return links.findMany({
      filter: { ticketId },
      sort: (sort) => sort.field('createdAt').asc(),
    });
  }

  async history(id: string): Promise<RecordHistory> {
    return this.runtime.history('tickets', id);
  }

  async workflowHistory(id: string): Promise<{
    transitions: TransitionEntry[];
    effectRuns: EffectRun[];
  }> {
    return this.runtime.history('tickets', id) as Promise<{
      transitions: TransitionEntry[];
      effectRuns: EffectRun[];
    }>;
  }

  async findFilesByTicket(ticketId: string): Promise<string[]> {
    const rows = await this.database
      .repository<TicketAttachment>('ticketAttachments')
      .findMany({ filter: { ticketId } });
    return rows.map((row) => row.attachmentId);
  }

  async ticketForAttachment(
    attachmentId: string,
  ): Promise<{ ticket: TicketRecord; link: TicketAttachment } | undefined> {
    const link = await this.database
      .repository<TicketAttachment>('ticketAttachments')
      .findOne({ filter: { attachmentId } });
    if (!link) return undefined;
    const ticket = await this.database
      .repository<TicketRecord>('tickets')
      .findOne({ filter: { id: link.ticketId } });
    return ticket ? { ticket: ticket, link } : undefined;
  }
}
