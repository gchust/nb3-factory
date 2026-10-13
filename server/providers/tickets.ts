/**
 * The service desk's domain logic: who may see which ticket, what the overview counts, and the reads and writes
 * the routes expose. It holds no HTTP concerns — no status codes, no request objects — so the routes stay thin and
 * this stays testable against a database.
 *
 * Every state change goes through the `tickets` lifecycle runtime, never a direct update of `status`,
 * `statusChangedAt` or `lifecycleVersion`. Visibility is derived from the caller's roles plus the record itself:
 * the service desk sees everything, an engineer sees what is assigned to them and what they raised, and everyone
 * else sees only what they raised.
 */
import {
  databaseManagerToken,
  type DatabaseManager,
  type FilterBuilder,
  type FilterNode,
  type Repository,
} from '@nocobase/db';
import type {
  JsonObject,
  LifecycleActor,
  LifecycleRuntime,
  RecordView,
} from '@nocobase/lifecycle';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import {
  DAY_MS,
  TICKET_LIFECYCLE,
  TICKET_OPEN_STATES,
  type TicketRecord,
  type TicketState,
} from '../lifecycles/tickets.js';
import { lifecycleRuntimeToken } from './lifecycle.js';
import {
  serviceDeskRoleServiceToken,
  type ServiceDeskRole,
  type ServiceDeskRoleService,
} from './roles.js';

export const ticketServiceToken = createServiceToken<TicketService>(
  'service-desk-tickets',
);

export interface ServiceDeskUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface TicketListItem extends TicketRecord {
  readonly requesterName: string;
  readonly assigneeName: string | null;
  readonly overdue: boolean;
}

export interface TicketListResult {
  readonly records: readonly TicketListItem[];
  readonly total: number;
}

export interface TicketListQuery {
  readonly status?: TicketState;
  readonly assigneeId?: string;
  readonly requesterId?: string;
  readonly scope?: 'all' | 'mine' | 'assigned';
  readonly overdue?: boolean;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface TicketView extends RecordView {
  readonly record: TicketRecord;
  readonly requester: ServiceDeskUser | null;
  readonly assignee: ServiceDeskUser | null;
  readonly overdue: boolean;
}

export interface TicketNote {
  readonly id: number;
  readonly ticketId: number;
  readonly authorId: string;
  readonly kind: 'handling' | 'comment' | 'system';
  readonly content: string;
  readonly createdAt: string;
  readonly authorName: string;
}

export interface TicketCreateInput {
  readonly title: string;
  readonly description: string;
  readonly category?: string | null;
  readonly location?: string | null;
  readonly urgency: string;
  readonly attachmentIds?: readonly string[];
}

export interface ServiceDeskMe {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly helpdesk: boolean;
  readonly engineer: boolean;
}

export interface ServiceDeskOverview {
  readonly me: {
    readonly userId: string;
    readonly helpdesk: boolean;
    readonly engineer: boolean;
  };
  readonly counts: Readonly<Record<TicketState, number>>;
  readonly pendingAssignment: number;
  readonly overdue: number;
  readonly open: number;
  readonly workload: readonly {
    readonly engineerId: string;
    readonly name: string;
    readonly open: number;
    readonly overdue: number;
  }[];
}

export interface TicketFireAction {
  readonly transition: string;
  readonly input?: JsonObject;
  readonly expectVersion?: number;
  /** The caller's key for this submission, so a retry of the same action fires once. */
  readonly requestId?: string;
}

/** A refusal the routes translate into a `404` rather than a lifecycle error. */
export const TICKET_NOT_FOUND = 'TICKET_NOT_FOUND';

export interface TicketService {
  rolesOf(userId: string): Promise<{ helpdesk: boolean; engineer: boolean }>;
  list(
    actor: LifecycleActor,
    query: TicketListQuery,
  ): Promise<TicketListResult>;
  view(actor: LifecycleActor, id: number): Promise<TicketView | undefined>;
  create(actor: LifecycleActor, input: TicketCreateInput): Promise<TicketView>;
  fire(
    actor: LifecycleActor,
    id: number,
    action: TicketFireAction,
  ): Promise<TicketView>;
  notes(actor: LifecycleActor, id: number): Promise<readonly TicketNote[]>;
  addNote(
    actor: LifecycleActor,
    id: number,
    content: string,
    kind: 'handling' | 'comment',
  ): Promise<TicketNote>;
  overview(actor: LifecycleActor): Promise<ServiceDeskOverview>;
  /** The caller as the service desk sees them: their name plus the roles they hold. */
  me(actor: LifecycleActor): Promise<ServiceDeskMe>;
  engineers(): Promise<readonly ServiceDeskUser[]>;
  staff(): Promise<readonly { user: ServiceDeskUser; role: ServiceDeskRole }[]>;
  directory(keyword: string): Promise<readonly ServiceDeskUser[]>;
  setRole(userId: string, role: ServiceDeskRole | null): Promise<void>;
}

export class TicketNotFoundError extends Error {
  readonly code = TICKET_NOT_FOUND;
  constructor() {
    super('Ticket not found.');
  }
}

function emptyCounts(): Record<TicketState, number> {
  return {
    submitted: 0,
    assigned: 0,
    processing: 0,
    resolved: 0,
    returned: 0,
    closed: 0,
    cancelled: 0,
  };
}

const USER_FIELDS = ['id', 'name', 'email'] as const;

export function createTicketService(dependencies: {
  database: DatabaseManager;
  roles: ServiceDeskRoleService;
  runtime: LifecycleRuntime;
}): TicketService {
  const { database, roles, runtime } = dependencies;

  const tickets = (): Repository<TicketRecord> =>
    database.repository<TicketRecord>('tickets');
  const users = (): Repository<ServiceDeskUser> =>
    database.repository<ServiceDeskUser>('user');
  const notes = (): Repository<{
    id: number;
    ticketId: number;
    authorId: string;
    kind: string;
    content: string;
    createdAt: string;
  }> => database.repository('ticketNotes');

  async function userMap(
    ids: readonly string[],
  ): Promise<Map<string, ServiceDeskUser>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await users().findMany({
      filter: (filter) =>
        filter.or(unique.map((id) => filter.string('id').eq(id))),
      select: (select) => select.fields(...USER_FIELDS),
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async function names(ids: readonly string[]): Promise<Map<string, string>> {
    const map = await userMap(ids);
    return new Map([...map].map(([id, user]) => [id, user.name]));
  }

  /**
   * Whether an open ticket has been waiting past 24 hours. The clock is the earlier of when it was raised and when
   * it last changed state. `statusChangedAt` alone is not enough: the overdue reminder is a self-transition that
   * resets it, so a ticket raised 26 hours ago would stop counting the moment it was reminded about, and would
   * never count as overdue again until another full day passed. Taking the earlier timestamp keeps the count honest
   * for as long as the ticket stays open, while a ticket whose state was backdated (the routes test does this) is
   * still overdue. A ticket in a final state is never overdue.
   */
  function isOverdue(
    record: Pick<TicketRecord, 'status' | 'statusChangedAt' | 'createdAt'>,
    now = Date.now(),
  ): boolean {
    if (!TICKET_OPEN_STATES.includes(record.status)) return false;
    const raised = Date.parse(record.createdAt);
    const changed = Date.parse(record.statusChangedAt);
    const since = Math.min(
      Number.isFinite(raised) ? raised : Number.POSITIVE_INFINITY,
      Number.isFinite(changed) ? changed : Number.POSITIVE_INFINITY,
    );
    return Number.isFinite(since) && since <= now - DAY_MS;
  }

  function canSee(
    record: Pick<TicketRecord, 'requesterId' | 'assigneeId'>,
    actorId: string,
    actorRoles: { helpdesk: boolean; engineer: boolean },
  ): boolean {
    if (actorRoles.helpdesk) return true;
    if (record.requesterId === actorId) return true;
    if (actorRoles.engineer && record.assigneeId === actorId) return true;
    return false;
  }

  function visibilityFilter(
    actor: LifecycleActor,
    actorRoles: { helpdesk: boolean; engineer: boolean },
    filter: FilterBuilder<TicketRecord>,
  ): FilterNode {
    if (actorRoles.helpdesk) return filter.and([]);
    if (actorRoles.engineer) {
      return filter.or([
        filter.string('assigneeId').eq(actor.id),
        filter.string('requesterId').eq(actor.id),
      ]);
    }
    return filter.string('requesterId').eq(actor.id);
  }

  function enrich(
    record: TicketRecord,
    directory: Map<string, string>,
  ): TicketListItem {
    return {
      ...record,
      requesterName: directory.get(record.requesterId) ?? record.requesterId,
      assigneeName: record.assigneeId
        ? (directory.get(record.assigneeId) ?? record.assigneeId)
        : null,
      overdue: isOverdue(record),
    };
  }

  async function record(id: number): Promise<TicketRecord | undefined> {
    return tickets().findOne({ filter: { id } });
  }

  async function requireVisible(
    actor: LifecycleActor,
    id: number,
  ): Promise<{
    record: TicketRecord;
    actorRoles: { helpdesk: boolean; engineer: boolean };
  }> {
    const found = await record(id);
    const actorRoles = await roles.rolesOf(actor.id);
    if (!found || !canSee(found, actor.id, actorRoles)) {
      throw new TicketNotFoundError();
    }
    return { record: found, actorRoles };
  }

  async function viewOf(
    actor: LifecycleActor,
    id: number,
  ): Promise<TicketView | undefined> {
    const found = await record(id);
    if (!found) return undefined;
    const actorRoles = await roles.rolesOf(actor.id);
    if (!canSee(found, actor.id, actorRoles)) return undefined;
    const base = await runtime.view(TICKET_LIFECYCLE, id, actor);
    const directory = await userMap([
      found.requesterId,
      ...(found.assigneeId ? [found.assigneeId] : []),
    ]);
    return {
      ...base,
      record: base.record as TicketRecord,
      requester: directory.get(found.requesterId) ?? null,
      assignee: found.assigneeId
        ? (directory.get(found.assigneeId) ?? null)
        : null,
      overdue: isOverdue(found),
    };
  }

  async function overview(actor: LifecycleActor): Promise<ServiceDeskOverview> {
    const actorRoles = await roles.rolesOf(actor.id);
    const rows = await tickets().findMany({
      filter: (filter) => visibilityFilter(actor, actorRoles, filter),
    });
    const counts = emptyCounts();
    let overdue = 0;
    const workloadByEngineer = new Map<
      string,
      { open: number; overdue: number }
    >();
    for (const row of rows) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
      if (!TICKET_OPEN_STATES.includes(row.status)) continue;
      if (isOverdue(row)) overdue += 1;
      if (row.assigneeId) {
        const entry = workloadByEngineer.get(row.assigneeId) ?? {
          open: 0,
          overdue: 0,
        };
        entry.open += 1;
        if (isOverdue(row)) entry.overdue += 1;
        workloadByEngineer.set(row.assigneeId, entry);
      }
    }
    const directory = await names([...workloadByEngineer.keys()]);
    const workload = [...workloadByEngineer.entries()]
      .map(([engineerId, counts2]) => ({
        engineerId,
        name: directory.get(engineerId) ?? engineerId,
        ...counts2,
      }))
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

    return {
      me: { userId: actor.id, ...actorRoles },
      counts,
      pendingAssignment: counts.submitted,
      overdue,
      open: TICKET_OPEN_STATES.reduce(
        (sum, state) => sum + (counts[state] ?? 0),
        0,
      ),
      workload: actorRoles.helpdesk
        ? workload
        : workload.filter((item) => item.engineerId === actor.id),
    };
  }

  return {
    rolesOf: (userId) => roles.rolesOf(userId),

    async list(actor, query) {
      const actorRoles = await roles.rolesOf(actor.id);
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
      const offset = Math.max(query.offset ?? 0, 0);

      const build = (filter: FilterBuilder<TicketRecord>): FilterNode => {
        const items: FilterNode[] = [
          visibilityFilter(actor, actorRoles, filter),
        ];
        if (query.status) items.push(filter.string('status').eq(query.status));
        if (query.assigneeId)
          items.push(filter.string('assigneeId').eq(query.assigneeId));
        if (query.requesterId)
          items.push(filter.string('requesterId').eq(query.requesterId));
        if (query.scope === 'mine')
          items.push(filter.string('requesterId').eq(actor.id));
        if (query.scope === 'assigned')
          items.push(filter.string('assigneeId').eq(actor.id));
        if (query.search) {
          items.push(
            filter.or([
              filter
                .string('title')
                .includes(query.search, { mode: 'insensitive' }),
              filter
                .string('description')
                .includes(query.search, { mode: 'insensitive' }),
            ]),
          );
        }
        if (query.overdue) {
          // Matches `isOverdue`: open and either raised or last changed before the cutoff, because the reminder
          // resets `statusChangedAt` while the ticket stays open. See the comment on `isOverdue`.
          const cutoff = new Date(Date.now() - DAY_MS).toISOString();
          items.push(
            filter.and([
              filter.or(
                TICKET_OPEN_STATES.map((state) =>
                  filter.string('status').eq(state),
                ),
              ),
              filter.or([
                filter.date('createdAt').before(cutoff),
                filter.date('statusChangedAt').before(cutoff),
              ]),
            ]),
          );
        }
        return filter.and(items);
      };

      const rows = await tickets().findMany({
        filter: build,
        sort: (sort) => sort.field('statusChangedAt').desc(),
        limit,
        offset,
      });
      const total = await tickets().count({ filter: build });
      const directory = await names([
        ...rows.map((row) => row.requesterId),
        ...rows.map((row) => row.assigneeId ?? ''),
      ]);
      return { records: rows.map((row) => enrich(row, directory)), total };
    },

    view: (actor, id) => viewOf(actor, id),

    async create(actor, input) {
      const now = new Date().toISOString();
      const result = await runtime.create(
        TICKET_LIFECYCLE,
        {
          title: input.title,
          description: input.description,
          category: input.category ?? null,
          location: input.location ?? null,
          urgency: input.urgency,
          requesterId: actor.id,
          assigneeId: null,
          solution: null,
          returnReason: null,
          attachmentIds: input.attachmentIds ? [...input.attachmentIds] : null,
          createdAt: now,
          updatedAt: now,
        },
        { actor, input: input as unknown as JsonObject },
      );
      const view = await viewOf(actor, Number(result.record.id));
      if (!view) throw new Error('The created ticket could not be read back.');
      return view;
    },

    async fire(actor, id, action) {
      await requireVisible(actor, id);
      await runtime.fire(TICKET_LIFECYCLE, id, action.transition, {
        actor,
        input: action.input ?? {},
        requestId: action.requestId,
        expect:
          typeof action.expectVersion === 'number'
            ? { version: action.expectVersion }
            : undefined,
      });
      const view = await viewOf(actor, id);
      if (!view) throw new TicketNotFoundError();
      return view;
    },

    async notes(actor, id) {
      await requireVisible(actor, id);
      const rows = await notes().findMany({
        filter: { ticketId: id },
        sort: (sort) => sort.field('createdAt').asc(),
      });
      const directory = await names(rows.map((row) => row.authorId));
      return rows.map((row) => ({
        id: row.id,
        ticketId: row.ticketId,
        authorId: row.authorId,
        kind: (row.kind as TicketNote['kind']) ?? 'comment',
        content: row.content,
        createdAt: row.createdAt,
        authorName: directory.get(row.authorId) ?? row.authorId,
      }));
    },

    async addNote(actor, id, content, kind) {
      const { record: ticket, actorRoles } = await requireVisible(actor, id);
      const isWorker =
        actorRoles.helpdesk ||
        (actorRoles.engineer && ticket.assigneeId === actor.id);
      const resolvedKind = kind === 'handling' && !isWorker ? 'comment' : kind;
      const createdAt = new Date().toISOString();
      const { record: created } = await notes().createOne({
        values: {
          ticketId: id,
          authorId: actor.id,
          kind: resolvedKind,
          content,
          createdAt,
        },
      });
      const directory = await names([actor.id]);
      return {
        id: created.id,
        ticketId: created.ticketId,
        authorId: created.authorId,
        kind: resolvedKind,
        content: created.content,
        createdAt: created.createdAt,
        authorName: directory.get(actor.id) ?? actor.id,
      };
    },

    overview,

    async me(actor) {
      const actorRoles = await roles.rolesOf(actor.id);
      const directory = await userMap([actor.id]);
      const user = directory.get(actor.id);
      return {
        userId: actor.id,
        name: user?.name ?? actor.id,
        email: user?.email ?? '',
        ...actorRoles,
      };
    },
    async engineers() {
      const staff = await roles.list();
      const engineerIds = staff
        .filter((row) => row.role === 'engineer')
        .map((row) => row.userId);
      const map = await userMap(engineerIds);
      return engineerIds
        .map((id) => map.get(id))
        .filter((user): user is ServiceDeskUser => Boolean(user));
    },

    async staff() {
      const rows = await roles.list();
      const map = await userMap(rows.map((row) => row.userId));
      return rows.map((row) => ({
        user: map.get(row.userId) ?? {
          id: row.userId,
          name: row.userId,
          email: '',
        },
        role: row.role,
      }));
    },

    async directory(keyword) {
      const trimmed = keyword.trim();
      const rows = await users().findMany({
        filter: trimmed
          ? (filter) =>
              filter.or([
                filter
                  .string('name')
                  .includes(trimmed, { mode: 'insensitive' }),
                filter
                  .string('email')
                  .includes(trimmed, { mode: 'insensitive' }),
              ])
          : undefined,
        select: (select) => select.fields(...USER_FIELDS),
        sort: (sort) => sort.field('name').asc(),
        limit: 20,
      });
      return rows;
    },

    setRole: (userId, role) => roles.setRole(userId, role),
  };
}

export class ServiceDeskTicketProvider extends ServiceProvider<Application> {
  readonly name = 'service-desk/tickets';

  register() {
    this.app.container.singleton(ticketServiceToken, (container) =>
      createTicketService({
        database: container.resolve(databaseManagerToken),
        roles: container.resolve(serviceDeskRoleServiceToken),
        runtime: container.resolve(lifecycleRuntimeToken),
      }),
    );
  }
}

export default ServiceDeskTicketProvider;
