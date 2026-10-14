import { randomUUID } from 'node:crypto';

import {
  authorizationToken,
  type AuthorizationContext,
} from '@nocobase/app-plugin-authorization/server';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';
import { ApiError } from '@nocobase/app-server/router';
import {
  databaseManagerToken,
  type FilterBuilder,
  type FilterNode,
} from '@nocobase/db';
import {
  LifecycleError,
  type JsonObject,
  type LifecycleActor,
  type LifecycleRuntime,
  type TransitionEntry,
} from '@nocobase/lifecycle';
import type { Application } from '@nocobase/app-server/application';

import {
  ENGINEER_PERMISSION_SET,
  SERVICE_DESK_PERMISSION_SET,
  listEngineerUserIds,
} from './notifier.js';
import type { TicketState } from './lifecycle.js';

/** How long a ticket may sit without a status change before it counts as overdue. */
export const OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000;

/** The record shape the `tickets` Collection resolves to. */
export interface TicketRow {
  id: number;
  title: string;
  description: string;
  urgency: string;
  reporterId: string;
  assigneeId: string | null;
  handlingNote: string | null;
  solution: string | null;
  attachmentIds: string[] | null;
  status: string;
  statusChangedAt: string;
  lifecycleVersion: number;
  assignedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  returnedCount: number;
  lastReturnReason: string | null;
  remindedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TicketFileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: string | number;
  createdAt: string;
  updatedAt: string;
}

interface UserRow {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
}

/** What the signed-in caller may see, derived from the Permission Sets they hold. */
export type TicketScope = 'all' | 'assigned' | 'own';

export interface TicketViewer {
  readonly userId: string;
  readonly scope: TicketScope;
  readonly actor: LifecycleActor;
}

export interface TicketAttachmentView {
  id: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: string | number;
  contentUrl: string;
}

export interface TicketTransitionView {
  name: string;
  to: string;
  allowed: boolean;
  blockers: string[];
}

export interface TicketView {
  id: number;
  title: string;
  description: string;
  urgency: string;
  status: string;
  reporterId: string;
  reporterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  handlingNote: string | null;
  solution: string | null;
  attachmentIds: string[];
  attachments: TicketAttachmentView[];
  assignedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  returnedCount: number;
  lastReturnReason: string | null;
  remindedAt: string | null;
  statusChangedAt: string;
  lifecycleVersion: number;
  createdAt: string;
  updatedAt: string;
  available: TicketTransitionView[];
  /** The transitions the caller's role allows on this ticket, before the state check. */
  canFire: string[];
  history: TicketHistoryView[];
}

export interface TicketHistoryView {
  transition: string;
  from: string | null;
  to: string;
  actorId: string;
  input: unknown;
  at: string;
  version: number;
}

export interface TicketListQuery {
  status?: string;
  urgency?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface TicketListResult {
  items: TicketView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketCreateInput {
  title: string;
  description: string;
  urgency?: string;
  attachmentIds?: string[];
}

export interface TicketFireInput {
  transition: string;
  input?: JsonObject;
  requestId?: string;
  expectVersion?: number;
}

export interface EngineerView {
  id: string;
  name: string | null;
  username: string | null;
  processing: number;
}

export interface TicketDashboard {
  counts: Record<TicketState, number>;
  pendingAssignment: TicketView[];
  overdue: TicketView[];
  workload: EngineerView[];
}

export interface TeamMemberView {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  roles: string[];
}

export interface TeamRoleOption {
  key: string;
  label: string;
  assignable: boolean;
  removable: boolean;
}

export interface TeamView {
  members: TeamMemberView[];
  roles: TeamRoleOption[];
}

export interface TeamMemberInput {
  name: string;
  username?: string;
  email: string;
  password: string;
  roles?: string[];
}

const MAX_PAGE_SIZE = 100;

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function nullableIso(value: unknown): string | null {
  if (value == null) return null;
  return toIso(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

/** The transition each role may fire; `remind` is trigger-only and never manual. */
const TRANSITION_PERMISSIONS: Record<
  string,
  (viewer: TicketViewer, ticket: TicketRow) => boolean
> = {
  assign: (viewer) => viewer.scope === 'all',
  reassign: (viewer) => viewer.scope === 'all',
  progress: (viewer, ticket) =>
    viewer.scope === 'all' ||
    (viewer.scope === 'assigned' && ticket.assigneeId === viewer.userId),
  resolve: (viewer, ticket) =>
    viewer.scope === 'all' ||
    (viewer.scope === 'assigned' && ticket.assigneeId === viewer.userId),
  confirm: (viewer, ticket) =>
    viewer.scope === 'all' || ticket.reporterId === viewer.userId,
  return: (viewer, ticket) =>
    viewer.scope === 'all' || ticket.reporterId === viewer.userId,
};

/**
 * The application's IT service desk. It owns data visibility, the per-transition permission rules and the DTO shape;
 * the state machine itself belongs to the lifecycle runtime.
 */
export class ItServiceDeskService {
  constructor(
    private readonly app: Application,
    private readonly runtime: LifecycleRuntime,
  ) {}

  private get database() {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get publicBasePath(): string {
    const base = this.app.publicBasePath ?? '';
    return base.replace(/\/$/, '');
  }

  /** Work out what the caller may see from the effective Permission Sets they hold. */
  async viewer(authz: AuthorizationContext): Promise<TicketViewer> {
    const identity = authz.identity;
    const actor: LifecycleActor = {
      id: String(identity.principal.id),
      system: false,
    };
    const snapshot = await authz.snapshot();
    let scope: TicketScope = 'own';
    if (snapshot.unrestricted) {
      scope = 'all';
    } else {
      const authorization = this.app.container.resolve(authorizationToken);
      const sets = await authorization.permissionSets.getEffective({
        principal: identity.principal,
        subjects: identity.subjects,
      });
      const keys = new Set(sets.map((set) => set.key));
      if (keys.has(SERVICE_DESK_PERMISSION_SET)) scope = 'all';
      else if (keys.has(ENGINEER_PERMISSION_SET)) scope = 'assigned';
    }
    return { userId: actor.id, scope, actor };
  }

  private async requireUnrestricted(authz: AuthorizationContext) {
    const snapshot = await authz.snapshot();
    if (!snapshot.unrestricted) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'TEAM_ADMIN_REQUIRED',
        domain: 'it-service-desk',
        message: 'Only an unrestricted administrator may manage the team.',
      });
    }
  }

  private async listRows(
    viewer: TicketViewer,
    query: TicketListQuery,
  ): Promise<{ rows: TicketRow[]; total: number }> {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize ?? 20) || 20),
    );
    const repository = this.database.repository<TicketRow>('tickets');

    const filter = (f: FilterBuilder<TicketRow>): FilterNode => {
      const items: FilterNode[] = [];
      if (viewer.scope === 'assigned')
        items.push(f.string('assigneeId').eq(viewer.userId));
      if (viewer.scope === 'own')
        items.push(f.string('reporterId').eq(viewer.userId));
      if (query.status) items.push(f.string('status').eq(query.status));
      if (query.urgency) items.push(f.string('urgency').eq(query.urgency));
      if (query.q) {
        items.push(
          f.or([
            f.string('title').includes(query.q, { mode: 'insensitive' }),
            f.text('description').includes(query.q, { mode: 'insensitive' }),
          ]),
        );
      }
      return f.and(items);
    };

    const [rows, total] = await Promise.all([
      repository.findMany({
        filter,
        sort: (s) => s.field('id').desc(),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      repository.count({ filter }),
    ]);
    return { rows, total };
  }

  async list(
    viewer: TicketViewer,
    query: TicketListQuery,
  ): Promise<TicketListResult> {
    const { rows, total } = await this.listRows(viewer, query);
    const items = await this.toViews(viewer, rows);
    return {
      items,
      total,
      page: Math.max(1, Number(query.page ?? 1) || 1),
      pageSize: Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, Number(query.pageSize ?? 20) || 20),
      ),
    };
  }

  private async findRow(
    viewer: TicketViewer,
    id: number,
  ): Promise<TicketRow | null> {
    const repository = this.database.repository<TicketRow>('tickets');
    const row = await repository.findOne({
      filter: (f) => {
        const items: FilterNode[] = [f.number('id').eq(id)];
        if (viewer.scope === 'assigned')
          items.push(f.string('assigneeId').eq(viewer.userId));
        if (viewer.scope === 'own')
          items.push(f.string('reporterId').eq(viewer.userId));
        return f.and(items);
      },
    });
    return (row as TicketRow | null) ?? null;
  }

  async get(viewer: TicketViewer, id: number): Promise<TicketView> {
    const row = await this.findRow(viewer, id);
    if (!row) throw notFound(id);
    const [view] = await this.toViews(viewer, [row], { detail: true });
    return view;
  }

  async create(
    viewer: TicketViewer,
    input: TicketCreateInput,
  ): Promise<TicketView> {
    const now = new Date();
    const result = await this.fireLifecycle(async () =>
      this.runtime.create(
        'tickets',
        {
          title: input.title,
          description: input.description,
          urgency: input.urgency ?? 'normal',
          reporterId: viewer.userId,
          assigneeId: null,
          handlingNote: null,
          solution: null,
          attachmentIds: input.attachmentIds ?? [],
          returnedCount: 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        { actor: viewer.actor },
      ),
    );
    return this.get(viewer, Number(result.record.id));
  }

  async fire(
    viewer: TicketViewer,
    id: number,
    input: TicketFireInput,
  ): Promise<TicketView> {
    const row = await this.findRow(viewer, id);
    if (!row) throw notFound(id);
    const allowed = TRANSITION_PERMISSIONS[input.transition];
    if (!allowed || !allowed(viewer, row)) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'TRANSITION_NOT_ALLOWED',
        domain: 'it-service-desk',
        message: `You may not run "${input.transition}" on this ticket.`,
      });
    }
    await this.fireLifecycle(() =>
      this.runtime.fire('tickets', id, input.transition, {
        actor: viewer.actor,
        input: input.input,
        requestId: input.requestId ?? randomUUID(),
        expect:
          input.expectVersion == null
            ? undefined
            : { version: input.expectVersion },
      }),
    );
    return this.get(viewer, id);
  }

  async dashboard(viewer: TicketViewer): Promise<TicketDashboard> {
    const rows = await this.database.repository<TicketRow>('tickets').findMany({
      filter: (f) => {
        const items: FilterNode[] = [];
        if (viewer.scope === 'assigned')
          items.push(f.string('assigneeId').eq(viewer.userId));
        if (viewer.scope === 'own')
          items.push(f.string('reporterId').eq(viewer.userId));
        return f.and(items);
      },
      sort: (s) => s.field('id').desc(),
    });

    const counts: Record<TicketState, number> = {
      pending: 0,
      processing: 0,
      resolved: 0,
      closed: 0,
    };
    const now = Date.now();
    const pendingAssignment: TicketRow[] = [];
    const overdue: TicketRow[] = [];
    for (const row of rows) {
      if (row.status in counts)
        counts[row.status as TicketState] =
          counts[row.status as TicketState] + 1;
      if (row.status === 'pending' && !row.assigneeId)
        pendingAssignment.push(row);
      // "Unresolved for over 24 hours" is measured from when the ticket was reported, not from its last status
      // change: the 24-hour reminder is itself a transition and would reset the status timestamp, dropping an
      // overdue ticket off the board exactly when it should stay visible until somebody resolves it.
      if (
        (row.status === 'pending' || row.status === 'processing') &&
        now - new Date(row.createdAt).getTime() > OVERDUE_AFTER_MS
      ) {
        overdue.push(row);
      }
    }

    const [pendingViews, overdueViews, workload] = await Promise.all([
      this.toViews(viewer, pendingAssignment.slice(0, 20)),
      this.toViews(viewer, overdue.slice(0, 20)),
      this.workload(),
    ]);

    return {
      counts,
      pendingAssignment: pendingViews,
      overdue: overdueViews,
      workload,
    };
  }

  private async workload(): Promise<EngineerView[]> {
    const engineerIds = await listEngineerUserIds(this.app);
    if (engineerIds.length === 0) return [];
    const [users, tickets] = await Promise.all([
      this.loadUsers(engineerIds),
      this.database.repository<TicketRow>('tickets').findMany({
        filter: (f) =>
          f.and([
            f.or(engineerIds.map((id) => f.string('assigneeId').eq(id))),
            f.or([
              f.string('status').eq('pending'),
              f.string('status').eq('processing'),
            ]),
          ]),
      }),
    ]);
    return engineerIds.map((id) => {
      const user = users.get(id);
      return {
        id,
        name: user?.name ?? null,
        username: user?.username ?? null,
        processing: tickets.filter((ticket) => ticket.assigneeId === id).length,
      };
    });
  }

  async engineers(): Promise<EngineerView[]> {
    return this.workload();
  }

  private async loadUsers(
    ids: readonly string[],
  ): Promise<Map<string, UserRow>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const users = await this.database.repository<UserRow>('user').findMany({
      filter: (f) => f.or(unique.map((id) => f.string('id').eq(id))),
    });
    return new Map(users.map((user) => [String(user.id), user]));
  }

  private async loadAttachments(
    ids: readonly string[],
  ): Promise<Map<string, TicketAttachmentView>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const files = await this.database
      .repository<TicketFileRow>('it_ticket_files')
      .findMany({
        filter: (f) => f.or(unique.map((id) => f.string('id').eq(id))),
      });
    const base = `${this.publicBasePath}/uploads/it-ticket-files`;
    return new Map(
      files.map((file) => [
        String(file.id),
        {
          id: String(file.id),
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: file.size,
          contentUrl: `${base}/${encodeURIComponent(String(file.id))}${file.ext ? `.${encodeURIComponent(file.ext)}` : ''}`,
        },
      ]),
    );
  }

  private async toViews(
    viewer: TicketViewer,
    rows: readonly TicketRow[],
    options: { detail?: boolean } = {},
  ): Promise<TicketView[]> {
    const userIds = rows.flatMap((row) =>
      [row.reporterId, row.assigneeId].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    );
    const attachmentIds = rows.flatMap((row) =>
      asStringArray(row.attachmentIds),
    );
    const [users, attachments] = await Promise.all([
      this.loadUsers(userIds),
      this.loadAttachments(attachmentIds),
    ]);

    return Promise.all(
      rows.map(async (row) => {
        const ids = asStringArray(row.attachmentIds);
        const view: TicketView = {
          id: Number(row.id),
          title: row.title,
          description: row.description,
          urgency: row.urgency,
          status: row.status,
          reporterId: row.reporterId,
          reporterName: users.get(row.reporterId)?.name ?? null,
          assigneeId: row.assigneeId,
          assigneeName: row.assigneeId
            ? (users.get(row.assigneeId)?.name ?? null)
            : null,
          handlingNote: row.handlingNote,
          solution: row.solution,
          attachmentIds: ids,
          attachments: ids
            .map((id) => attachments.get(id))
            .filter((item): item is TicketAttachmentView => Boolean(item)),
          assignedAt: nullableIso(row.assignedAt),
          resolvedAt: nullableIso(row.resolvedAt),
          closedAt: nullableIso(row.closedAt),
          returnedCount: Number(row.returnedCount ?? 0),
          lastReturnReason: row.lastReturnReason,
          remindedAt: nullableIso(row.remindedAt),
          statusChangedAt: toIso(row.statusChangedAt),
          lifecycleVersion: Number(row.lifecycleVersion ?? 0),
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
          available: [],
          canFire: Object.entries(TRANSITION_PERMISSIONS)
            .filter(([, allowed]) => allowed(viewer, row))
            .map(([name]) => name),
          history: [],
        };
        if (options.detail) {
          const [recordView, history] = await Promise.all([
            this.runtime.view('tickets', Number(row.id), viewer.actor),
            this.runtime.history('tickets', Number(row.id)),
          ]);
          view.available = recordView.available.map((item) => ({
            name: item.name,
            to: item.to[0] ?? '',
            allowed: item.allowed,
            blockers: item.blockers.map((blocker) => blocker.code),
          }));
          view.history = history.transitions.map((entry) =>
            this.toHistoryView(entry),
          );
        }
        return view;
      }),
    );
  }

  private toHistoryView(entry: TransitionEntry): TicketHistoryView {
    return {
      transition: entry.transition,
      from: entry.from,
      to: entry.to,
      actorId: entry.actorId,
      input: entry.input,
      at: toIso(entry.at),
      version: entry.version,
    };
  }

  private async fireLifecycle<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw mapLifecycleError(error);
    }
  }

  async team(authz: AuthorizationContext): Promise<TeamView> {
    await this.requireUnrestricted(authz);
    const users = this.app.container.resolve(userManagementServiceToken);
    const [page, options] = await Promise.all([
      users.list({ page: 1, pageSize: MAX_PAGE_SIZE }),
      users.options(),
    ]);
    const appScope = options.roleScopes.find((scope) => scope.key === 'app');
    return {
      members: page.items.map((member) => ({
        id: member.id,
        name: member.name ?? null,
        username: member.username ?? null,
        email: member.email,
        roles: roleList(member.roleScopes?.app),
      })),
      roles: (appScope?.options ?? []).map((role) => ({
        key: role.value,
        label: role.label,
        assignable: role.assignable ?? true,
        removable: role.removable ?? true,
      })),
    };
  }

  async createMember(
    authz: AuthorizationContext,
    input: TeamMemberInput,
  ): Promise<TeamMemberView> {
    await this.requireUnrestricted(authz);
    const users = this.app.container.resolve(userManagementServiceToken);
    const member = await users.create({
      name: input.name,
      username: input.username,
      email: input.email,
      password: input.password,
      roleScopes: { app: input.roles ?? [] },
    });
    return {
      id: member.id,
      name: member.name ?? null,
      username: member.username ?? null,
      email: member.email,
      roles: roleList(member.roleScopes?.app),
    };
  }

  async setMemberRoles(
    authz: AuthorizationContext,
    userId: string,
    roles: string[],
  ): Promise<TeamMemberView> {
    await this.requireUnrestricted(authz);
    const users = this.app.container.resolve(userManagementServiceToken);
    const member = await users.replaceRoleScope(userId, 'app', roles);
    return {
      id: member.id,
      name: member.name ?? null,
      username: member.username ?? null,
      email: member.email,
      roles: roleList(member.roleScopes?.app),
    };
  }
}

function roleList(value: unknown): string[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  const result: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') result.push(item);
  }
  return result;
}

function notFound(id: number): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'TICKET_NOT_FOUND',
    domain: 'it-service-desk',
    message: `Ticket ${id} was not found.`,
  });
}

function mapLifecycleError(error: unknown): Error {
  if (!(error instanceof LifecycleError)) return error as Error;
  const message = error.message;
  switch (error.code) {
    case 'RECORD_NOT_FOUND':
      return new ApiError({
        status: 'NOT_FOUND',
        reason: 'TICKET_NOT_FOUND',
        domain: 'it-service-desk',
        message,
      });
    case 'GUARD_REJECTED': {
      const denied = error.blockers.some(
        (blocker) => blocker.kind === 'permission',
      );
      return new ApiError({
        status: denied ? 'PERMISSION_DENIED' : 'FAILED_PRECONDITION',
        reason: denied ? 'TRANSITION_BLOCKED' : 'TRANSITION_PRECONDITION',
        domain: 'it-service-desk',
        message,
      });
    }
    case 'NOT_MANUAL':
      return new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'TRANSITION_NOT_MANUAL',
        domain: 'it-service-desk',
        message,
      });
    case 'CONFLICT':
    case 'REQUEST_REUSED':
      return new ApiError({
        status: 'ABORTED',
        reason: 'TRANSITION_CONFLICT',
        domain: 'it-service-desk',
        message,
      });
    default:
      return new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: 'TRANSITION_INVALID',
        domain: 'it-service-desk',
        message,
      });
  }
}

export type { LifecycleActor };
