import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  defineDatabasePermission,
} from '@nocobase/app-plugin-authorization/server';
import { defineAuthorizationResource } from '@nocobase/authorization/core';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export const TEAM_TASK_RESOURCE = 'teamTasks';
export const TEAM_TASK_MANAGE_ACTION = 'manage';

export type TeamTaskStatus = 'pending' | 'done';

export const TEAM_TASK_STATUSES: readonly TeamTaskStatus[] = [
  'pending',
  'done',
];

export interface TeamTask {
  readonly id: number;
  readonly title: string;
  readonly notes: string | null;
  readonly status: TeamTaskStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListTeamTasksFilter {
  readonly status?: TeamTaskStatus;
}

export interface CreateTeamTaskInput {
  readonly title: unknown;
  readonly notes?: unknown;
}

export interface UpdateTeamTaskInput {
  readonly title?: unknown;
  readonly notes?: unknown;
  readonly status?: unknown;
}

/** A request body that is syntactically fine but is not a usable task. */
export class TeamTaskValidationError extends Error {}

export interface TeamTaskService {
  list(filter?: ListTeamTasksFilter): Promise<TeamTask[]>;
  create(input: CreateTeamTaskInput): Promise<TeamTask>;
  update(id: number, input: UpdateTeamTaskInput): Promise<TeamTask | undefined>;
}

export const teamTaskServiceToken: ServiceToken<TeamTaskService> =
  createServiceToken<TeamTaskService>('app/team-task-service');

export function isTeamTaskStatus(value: unknown): value is TeamTaskStatus {
  return value === 'pending' || value === 'done';
}

export function parseTeamTaskId(value: string): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function normalizeTeamTaskTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TeamTaskValidationError('A non-empty title is required.');
  }
  return value.trim();
}

export function normalizeTeamTaskNotes(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new TeamTaskValidationError('Notes must be text.');
  }
  const notes = value.trim();
  return notes.length === 0 ? null : notes;
}

export function normalizeTeamTaskStatus(value: unknown): TeamTaskStatus {
  if (!isTeamTaskStatus(value)) {
    throw new TeamTaskValidationError('Status must be pending or done.');
  }
  return value;
}

export function createTeamTaskService(
  databaseManager: DatabaseManager,
): TeamTaskService {
  const query = databaseManager.query();

  return {
    async list(filter): Promise<TeamTask[]> {
      let builder = query.selectFrom('teamTasks').selectAll();
      if (filter?.status) {
        builder = builder.where('status', '=', filter.status);
      }
      const rows = await builder.orderBy('id', 'asc').execute();
      return rows.map(normalizeRow);
    },

    async create(input): Promise<TeamTask> {
      const title = normalizeTeamTaskTitle(input.title);
      const notes = normalizeTeamTaskNotes(input.notes);
      const now = new Date();
      const result = await query
        .insertInto('teamTasks')
        .values({
          title,
          notes,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const created = await findById(result.insertId);
      if (created) {
        return created;
      }

      const fallback = await query
        .selectFrom('teamTasks')
        .selectAll()
        .where('title', '=', title)
        .orderBy('id', 'desc')
        .limit(1)
        .executeTakeFirst();
      if (!fallback) {
        throw new Error('The created team task could not be loaded.');
      }
      return normalizeRow(fallback);
    },

    async update(id, input): Promise<TeamTask | undefined> {
      const existing = await findById(id);
      if (!existing) {
        return undefined;
      }

      const changes: Record<string, unknown> = {};
      if (input.title !== undefined) {
        changes.title = normalizeTeamTaskTitle(input.title);
      }
      if (input.notes !== undefined) {
        changes.notes = normalizeTeamTaskNotes(input.notes);
      }
      if (input.status !== undefined) {
        changes.status = normalizeTeamTaskStatus(input.status);
      }

      if (Object.keys(changes).length === 0) {
        return existing;
      }

      changes.updatedAt = new Date();
      await query
        .updateTable('teamTasks')
        .set(changes)
        .where('id', '=', id)
        .execute();
      return findById(id);
    },
  };

  async function findById(id: unknown): Promise<TeamTask | undefined> {
    const numericId = typeof id === 'number' ? id : Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return undefined;
    }
    const row = await query
      .selectFrom('teamTasks')
      .selectAll()
      .where('id', '=', numericId)
      .executeTakeFirst();
    return row ? normalizeRow(row) : undefined;
  }
}

function normalizeRow(row: Record<string, unknown>): TeamTask {
  return {
    id: Number(row.id),
    title: toText(row.title) ?? '',
    notes: toText(row.notes),
    status: isTeamTaskStatus(row.status) ? row.status : 'pending',
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return toText(value) ?? '';
}

/**
 * The application-owned collection and the "manage" business operation that
 * gates every write. Viewing is deliberately not an operation: any signed-in
 * user may read the checklist, so the read route only requires a session.
 */
const teamTaskData = defineDatabasePermission((permission) =>
  permission
    .collection('teamTasks')
    .title('Team tasks')
    .read(['id', 'title', 'notes', 'status', 'createdAt', 'updatedAt'])
    .create(['title', 'notes', 'status', 'createdAt', 'updatedAt'])
    .update(['title', 'notes', 'status', 'updatedAt']),
);

const teamTasksResource = defineAuthorizationResource(
  TEAM_TASK_RESOURCE,
  (resource) =>
    resource
      .title('Team tasks')
      .group(TEAM_TASK_RESOURCE)
      .action(TEAM_TASK_MANAGE_ACTION, (action) =>
        action.title('Manage team tasks').grant('teamTasks', teamTaskData),
      ),
);

export default class TeamTasksProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/team-tasks-provider';

  public override register(): void {
    this.app.container.singleton(teamTaskServiceToken, () =>
      createTeamTaskService(this.app.container.resolve(databaseManagerToken)),
    );
  }

  public override async boot(): Promise<void> {
    const authz = this.app.container.resolve(authorizationToken);

    authz.resourceGroups.add({
      name: TEAM_TASK_RESOURCE,
      title: 'Team tasks',
      category: 'business',
    });
    authz.db.collections.add({ name: 'teamTasks', title: 'Team tasks' });
    teamTasksResource.register(authz.resources);
  }
}
