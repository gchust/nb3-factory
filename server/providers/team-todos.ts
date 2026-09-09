import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

// `create-app` rewrites this literal to the generated application's own package name. Keeping it alone on one short
// line means the rewrite cannot change how Prettier wraps the statements that use it: a shorter name would otherwise
// let a wrapped call collapse onto one line, leaving the generated project failing its own `pnpm format:check`.
const APP_PACKAGE_NAME = 'nb3-factory';

export const TODO_STATUSES = ['pending', 'inProgress', 'completed'] as const;
export const TODO_PRIORITIES = ['normal', 'urgent'] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export interface TeamTodo {
  id: number;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamTodoStats {
  all: number;
  pending: number;
  inProgress: number;
  completed: number;
}

export interface TeamTodoListResult {
  data: TeamTodo[];
  /** Counts over every record, unaffected by search or status filters. */
  stats: TeamTodoStats;
}

export interface TeamTodoInput {
  title?: string;
  description?: string | null;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueDate?: string | null;
}

export interface TeamTodoServiceLike {
  list(options?: {
    search?: string;
    status?: TodoStatus;
  }): Promise<TeamTodoListResult>;
  create(input: TeamTodoInput): Promise<TeamTodo>;
  update(id: number, input: TeamTodoInput): Promise<TeamTodo>;
  remove(id: number): Promise<boolean>;
}

/** A client-caused input problem; the route maps it to a 400 with a stable code. */
export class TeamTodoValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TeamTodoValidationError';
    this.code = code;
  }
}

export class TeamTodoNotFoundError extends Error {
  constructor(message = 'Todo not found.') {
    super(message);
    this.name = 'TeamTodoNotFoundError';
  }
}

export const teamTodoServiceToken: ServiceToken<TeamTodoServiceLike> =
  createServiceToken<TeamTodoServiceLike>(
    `${APP_PACKAGE_NAME}/team-todo-service`,
  );

export default class TeamTodoProvider extends ServiceProvider<Application> {
  public readonly name: string = `${APP_PACKAGE_NAME}/team-todo-provider`;

  public override register(): void {
    if (!this.app.container.has(databaseManagerToken)) {
      return;
    }
    this.app.container.singleton(teamTodoServiceToken, (container) => {
      return new TeamTodoService(container.resolve(databaseManagerToken));
    });
  }
}

export class TeamTodoService implements TeamTodoServiceLike {
  constructor(private readonly database: DatabaseManager) {}

  async list(
    options: { search?: string; status?: TodoStatus } = {},
  ): Promise<TeamTodoListResult> {
    const stats = await this.computeStats();

    let listQuery = this.database.query().selectFrom('teamTodos').selectAll();
    if (options.status) {
      listQuery = listQuery.where('status', '=', options.status);
    }
    if (options.search) {
      listQuery = listQuery.where('title', 'like', `%${options.search}%`);
    }

    const data = await listQuery.orderBy('id', 'desc').execute();
    return { data: data as unknown as TeamTodo[], stats };
  }

  async create(input: TeamTodoInput): Promise<TeamTodo> {
    const now = new Date().toISOString();
    const result = await this.database
      .query()
      .insertInto('teamTodos')
      .values({
        title: validateTitle(input.title),
        description: normalizeDescription(input.description),
        status: validateStatus(input.status ?? 'pending'),
        priority: validatePriority(input.priority ?? 'normal'),
        dueDate: normalizeDueDate(input.dueDate),
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const id = Number(result.insertId);
    const created = await this.findById(id);
    if (!created) {
      throw new Error('Failed to read the created todo.');
    }
    return created;
  }

  async update(id: number, input: TeamTodoInput): Promise<TeamTodo> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new TeamTodoNotFoundError();
    }

    const changes: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (input.title !== undefined) {
      changes.title = validateTitle(input.title);
    }
    if (input.description !== undefined) {
      changes.description = normalizeDescription(input.description);
    }
    if (input.status !== undefined) {
      changes.status = validateStatus(input.status);
    }
    if (input.priority !== undefined) {
      changes.priority = validatePriority(input.priority);
    }
    if (input.dueDate !== undefined) {
      changes.dueDate = normalizeDueDate(input.dueDate);
    }

    await this.database
      .query()
      .updateTable('teamTodos')
      .set(changes)
      .where('id', '=', id)
      .execute();

    const updated = await this.findById(id);
    if (!updated) {
      throw new TeamTodoNotFoundError();
    }
    return updated;
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.database
      .query()
      .deleteFrom('teamTodos')
      .where('id', '=', id)
      .execute();
    return (result.deletedCount ?? 0) > 0;
  }

  private async findById(id: number): Promise<TeamTodo | undefined> {
    const row = await this.database
      .query()
      .selectFrom('teamTodos')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row as unknown as TeamTodo | undefined;
  }

  private async computeStats(): Promise<TeamTodoStats> {
    const rows = await this.database
      .query()
      .selectFrom('teamTodos')
      .select((eb) => [eb.fn.countAll<number>().as('count'), 'status'])
      .groupBy('status')
      .execute();

    const counts: Record<string, number> = {};
    let all = 0;
    for (const row of rows) {
      const count = Number(row.count ?? 0);
      all += count;
      counts[String(row.status)] = count;
    }

    return {
      all,
      pending: counts.pending ?? 0,
      inProgress: counts.inProgress ?? 0,
      completed: counts.completed ?? 0,
    };
  }
}

function validateTitle(title: unknown): string {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new TeamTodoValidationError('TITLE_REQUIRED', 'Title is required.');
  }
  const trimmed = title.trim();
  if (trimmed.length > 100) {
    throw new TeamTodoValidationError(
      'TITLE_TOO_LONG',
      'Title must be at most 100 characters.',
    );
  }
  return trimmed;
}

function validateStatus(status: unknown): TodoStatus {
  if (TODO_STATUSES.includes(status as TodoStatus)) {
    return status as TodoStatus;
  }
  throw new TeamTodoValidationError('INVALID_STATUS', 'Invalid status.');
}

function validatePriority(priority: unknown): TodoPriority {
  if (TODO_PRIORITIES.includes(priority as TodoPriority)) {
    return priority as TodoPriority;
  }
  throw new TeamTodoValidationError('INVALID_PRIORITY', 'Invalid priority.');
}

function normalizeDescription(description: unknown): string | null {
  if (description === undefined || description === null) {
    return null;
  }
  if (typeof description !== 'string') {
    throw new TeamTodoValidationError(
      'INVALID_DESCRIPTION',
      'Invalid description.',
    );
  }
  const value = description.trim();
  return value === '' ? null : value;
}

function normalizeDueDate(dueDate: unknown): string | null {
  if (dueDate === undefined || dueDate === null || dueDate === '') {
    return null;
  }
  if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new TeamTodoValidationError('INVALID_DUE_DATE', 'Invalid due date.');
  }
  return dueDate;
}
