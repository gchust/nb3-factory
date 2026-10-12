import { randomUUID } from 'node:crypto';

import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { ApiError } from '@nocobase/app-server/router';
import type {
  DatabaseManager,
  Repository,
  RepositoryFilter,
  RepositoryPolicy,
  RepositorySort,
} from '@nocobase/db';
import type { FilterBuilder, FilterNode } from '@nocobase/repository-input';
import {
  AuthorizationDeniedError,
  type AuthorizationContext,
} from '@nocobase/authorization/core';
import type {
  AvailableTransition,
  JsonObject,
  LifecycleActor,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { createServiceToken } from '@nocobase/service-provider';

import {
  OVERDUE_AFTER_MS,
  type Ticket,
  type TicketPriority,
  type TicketState,
} from './lifecycle.js';
import { ENGINEER_PERMISSION_SET, TICKETS_RESOURCE } from './resources.js';

/** The service the routes call; registered by `server/providers/helpdesk.ts`. */
export const helpdeskServiceToken =
  createServiceToken<HelpdeskService>('helpdesk/service');

export interface TicketListQuery {
  readonly status?: TicketState;
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface TicketListResult {
  readonly rows: Ticket[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface TicketComment {
  readonly id: string;
  readonly ticketId: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly kind: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface TicketAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: string | number;
}

export interface OfferedTransition {
  readonly name: string;
  readonly title: string;
  readonly allowed: boolean;
  readonly blockers: readonly { code: string; message: string }[];
}

export interface TicketDetail {
  readonly ticket: Ticket;
  readonly available: readonly OfferedTransition[];
  readonly comments: readonly TicketComment[];
  readonly attachments: readonly TicketAttachment[];
}

export interface TicketOverview {
  readonly role: 'service-desk' | 'engineer' | 'employee';
  readonly stats: {
    readonly pending: number;
    readonly overdue: number;
    readonly open: number;
    readonly resolved: number;
    readonly total: number;
  };
  readonly workload: readonly {
    readonly id: string;
    readonly name: string;
    readonly count: number;
  }[];
  readonly recent: readonly Ticket[];
}

export interface FireInput {
  readonly transition: string;
  readonly input: Record<string, unknown>;
  readonly version?: number;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly category?: string | null;
  readonly priority: TicketPriority;
  readonly screenshotIds?: string[];
}

/** Who is acting, the name to show for them, and the authorization context their request resolved in. */
export interface ActorContext {
  readonly actor: LifecycleActor;
  readonly name: string;
  readonly authz: AuthorizationContext;
}

const OPEN_STATES: readonly TicketState[] = [
  'submitted',
  'assigned',
  'processing',
];

const newestFirst: RepositorySort<Ticket> = (sort) =>
  sort.field('createdAt').desc();

const byName: RepositorySort<{ id: string; name: string; email: string }> = (
  sort,
) => sort.field('name').asc();

export class HelpdeskService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly runtime: LifecycleRuntime,
    private readonly authorization: AppAuthorization,
  ) {}

  /**
   * Reads on an action's data scope: the folded Repository Policy of the caller's grants for that action, so an
   * employee reads their own tickets, an engineer the ones assigned to them, and the service desk every ticket.
   *
   * The bound Repository's record type degrades to `Partial` because a Policy may narrow the fields; the cast back to
   * full tickets is the application's own claim that its Policies read whole rows, and it is what lets the rest of
   * this file stay in the domain types.
   */
  private async scoped<T extends object>(
    collection: string,
    context: ActorContext,
    action: string,
  ): Promise<Repository<T>> {
    const policy = await this.policy(collection, context, action);
    return this.database
      .repository<T>(collection)
      .withPolicy(policy as RepositoryPolicy<T>) as unknown as Repository<T>;
  }

  private policy(
    collection: string,
    context: ActorContext,
    action: string,
  ): Promise<RepositoryPolicy> {
    return this.authorization.database.policyFor(collection, context.authz, {
      resource: TICKETS_RESOURCE,
      action,
    });
  }

  async list(
    context: ActorContext,
    query: TicketListQuery,
  ): Promise<TicketListResult> {
    const repository = await this.scoped<Ticket>('tickets', context, 'view');
    const filter = ticketFilter(query);
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 20;
    const rows = await repository.findMany({
      ...(filter ? { filter } : {}),
      sort: newestFirst,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const total = await repository.count(filter ? { filter } : {});
    return { rows, total, page, pageSize };
  }

  async detail(
    context: ActorContext,
    id: string,
  ): Promise<TicketDetail | undefined> {
    const visible = await this.visible(context, id, 'view');
    if (!visible) return undefined;
    const view = await this.runtime.view('tickets', id, context.actor);
    const ticket = view.record as unknown as Ticket;
    const available: OfferedTransition[] = [];
    for (const transition of view.available) {
      // A transition the caller has no permission for would be refused by the route; do not offer the button.
      const decision = await context.authz.authorize({
        resource: { type: 'composite', id: TICKETS_RESOURCE },
        action: transition.name,
      });
      if (decision.effect === 'deny') continue;
      available.push(offer(transition));
    }
    const comments = await this.database
      .repository<TicketComment>('ticketComments')
      .findMany({
        filter: (filter) => filter.string('ticketId').eq(id),
        sort: (sort) => sort.field('createdAt').asc(),
      });
    const screenshotIds = ticket.screenshotIds ?? [];
    const attachments = screenshotIds.length
      ? await this.database
          .repository<TicketAttachment>('ticketAttachments')
          .findMany({ filter: idsFilter(screenshotIds) })
      : [];
    return { ticket, available, comments, attachments };
  }

  async create(
    context: ActorContext,
    input: CreateTicketInput,
  ): Promise<Ticket> {
    // A composite action always resolves to a conditional decision, so `require` never accepts it; the create
    // decision is the permission check, and its per-collection policy is what says the write is allowed at all.
    const decision = await context.authz.authorize({
      resource: { type: 'composite', id: TICKETS_RESOURCE },
      action: 'create',
    });
    const policy = (
      decision.conditions as
        { database?: Record<string, RepositoryPolicy> } | undefined
    )?.database?.tickets;
    if (decision.effect === 'deny' || !policy) {
      throw new AuthorizationDeniedError(decision);
    }
    const now = new Date().toISOString();
    const result = await this.runtime.create(
      'tickets',
      {
        id: randomUUID(),
        title: input.title,
        description: input.description,
        category: input.category ?? null,
        priority: input.priority,
        reporterId: context.actor.id,
        reporterName: context.name,
        screenshotIds: input.screenshotIds ?? null,
        createdAt: now,
        updatedAt: now,
      },
      { actor: context.actor },
    );
    return result.record as unknown as Ticket;
  }

  async fire(
    context: ActorContext,
    id: string,
    input: FireInput,
  ): Promise<Ticket | undefined> {
    const visible = await this.visible(context, id, input.transition);
    if (!visible) return undefined;
    const values: Record<string, unknown> = { ...input.input };
    // The engineer's name is what the UI shows; resolve it from the id the desk chose rather than trusting the body.
    if (
      input.transition === 'assign' &&
      typeof values.assigneeId === 'string'
    ) {
      const assignee = await this.database
        .repository<{ id: string; name: string }>('user')
        .findOne({
          filter: (filter) =>
            filter.string('id').eq(values.assigneeId as string),
          select: (select) => select.fields('id', 'name'),
        });
      if (!assignee) {
        throw new ApiError({
          status: 'INVALID_ARGUMENT',
          reason: 'UNKNOWN_ASSIGNEE',
          domain: 'helpdesk',
          message: `No user with id ${String(values.assigneeId)}.`,
        });
      }
      values.assigneeName = assignee.name;
    }
    const result = await this.runtime.fire('tickets', id, input.transition, {
      actor: context.actor,
      manual: true,
      input: values as JsonObject,
      expect: input.version !== undefined ? { version: input.version } : {},
    });
    const now = new Date();
    await this.database
      .repository('tickets')
      .updateOne({ filter: { id }, values: { updatedAt: now } });
    return {
      ...(result.record as unknown as Ticket),
      updatedAt: now.toISOString(),
    };
  }

  async comment(
    context: ActorContext,
    id: string,
    input: { body: string; kind?: string },
  ): Promise<TicketComment | undefined> {
    const visible = await this.visible(context, id, 'comment');
    if (!visible) return undefined;
    const created = await this.database
      .repository<TicketComment>('ticketComments')
      .createOne({
        values: {
          id: randomUUID(),
          ticketId: id,
          authorId: context.actor.id,
          authorName: context.name,
          kind: input.kind === 'processing' ? 'processing' : 'comment',
          body: input.body,
          createdAt: new Date().toISOString(),
        },
      });
    return created.record;
  }

  async overview(context: ActorContext): Promise<TicketOverview> {
    const [dashboardDecision, engineerDecision] = await Promise.all([
      context.authz.authorize({
        resource: { type: 'composite', id: TICKETS_RESOURCE },
        action: 'dashboard',
      }),
      context.authz.authorize({
        resource: { type: 'composite', id: TICKETS_RESOURCE },
        action: 'start',
      }),
    ]);
    const role =
      dashboardDecision.effect !== 'deny'
        ? 'service-desk'
        : engineerDecision.effect !== 'deny'
          ? 'engineer'
          : 'employee';
    const repository = await this.scoped<Ticket>('tickets', context, 'view');
    const all = await repository.findMany({ sort: newestFirst });
    const recent = all.slice(0, 5);
    if (role !== 'service-desk') {
      return { role, stats: summarize(all), workload: [], recent };
    }
    const counts = new Map<
      string,
      { id: string; name: string; count: number }
    >();
    for (const ticket of all) {
      if (!ticket.assigneeId || !OPEN_STATES.includes(ticket.status)) continue;
      const entry = counts.get(ticket.assigneeId) ?? {
        id: ticket.assigneeId,
        name: ticket.assigneeName ?? ticket.assigneeId,
        count: 0,
      };
      entry.count += 1;
      counts.set(ticket.assigneeId, entry);
    }
    const workload = [...counts.values()].sort((a, b) => b.count - a.count);
    return { role, stats: summarize(all), workload, recent };
  }

  /** The engineers a service desk can assign to: the direct holders of the engineer permission set. */
  async engineers(): Promise<{ id: string; name: string; email: string }[]> {
    const assignments = await this.database
      .repository<{ subjectId: string }>(
        'authorizationPermissionSetAssignments',
      )
      .findMany({
        filter: {
          permissionSetKey: ENGINEER_PERMISSION_SET,
          subjectType: 'user',
        } as RepositoryFilter<{ subjectId: string }>,
        select: (select) => select.fields('subjectId'),
      });
    const ids = assignments.map((assignment) => assignment.subjectId);
    if (ids.length === 0) return [];
    return this.database
      .repository<{ id: string; name: string; email: string }>('user')
      .findMany({
        filter: idsFilter(ids),
        select: (select) => select.fields('id', 'name', 'email'),
        sort: byName,
      });
  }

  /** The ticket when the caller's data scope for `action` covers it, otherwise nothing. */
  async visible(
    context: ActorContext,
    id: string,
    action: string,
  ): Promise<Ticket | undefined> {
    const repository = await this.scoped<Ticket>('tickets', context, action);
    return repository.findOne({
      filter: (filter) => filter.string('id').eq(id),
    });
  }
}

function offer(transition: AvailableTransition): OfferedTransition {
  return {
    name: transition.name,
    title: transition.title,
    allowed: transition.allowed,
    blockers: transition.blockers.map((blocker) => ({
      code: blocker.code,
      message: blocker.message,
    })),
  };
}

/** A title/status filter as the Repository's builder, or nothing when the caller narrowed nothing. */
function ticketFilter(
  query: TicketListQuery,
): RepositoryFilter<Ticket> | undefined {
  if (!query.status && !query.q) return undefined;
  return (filter: FilterBuilder<Ticket>): FilterNode => {
    const items: FilterNode[] = [];
    if (query.status) items.push(filter.string('status').eq(query.status));
    if (query.q) items.push(filter.string('title').includes(query.q));
    return items.length === 1 ? items[0] : filter.and(items);
  };
}

/** An `id IN (...)` filter; the Repository API has no `$in`, so the members become an `or` of equalities. */
function idsFilter<T extends object>(
  ids: readonly string[],
): RepositoryFilter<T> {
  return (filter: FilterBuilder<T>): FilterNode =>
    filter.or(ids.map((id) => filter.string('id').eq(id)));
}

function summarize(tickets: readonly Ticket[]): TicketOverview['stats'] {
  const threshold = Date.now() - OVERDUE_AFTER_MS;
  let pending = 0;
  let overdue = 0;
  let open = 0;
  let resolved = 0;
  for (const ticket of tickets) {
    if (ticket.status === 'submitted' && !ticket.assigneeId) pending += 1;
    if (
      OPEN_STATES.includes(ticket.status) &&
      new Date(ticket.createdAt).getTime() < threshold
    ) {
      overdue += 1;
    }
    if (OPEN_STATES.includes(ticket.status)) open += 1;
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      resolved += 1;
    }
  }
  return { pending, overdue, open, resolved, total: tickets.length };
}
