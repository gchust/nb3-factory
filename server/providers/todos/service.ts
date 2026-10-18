import type { DatabaseManager } from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';

export interface TodoRecord {
  id: number;
  title: string;
  dueAt: string;
  completed: boolean;
  expired: boolean;
}

export interface CreateTodoInput {
  readonly title: string;
  readonly dueAt: string;
}

export interface UpdateTodoInput {
  readonly title?: string;
  readonly dueAt?: string;
  readonly completed?: boolean;
}

export interface RefreshOverdueResult {
  readonly updatedCount: number;
  readonly todos: readonly TodoRecord[];
}

export const todosServiceToken = createServiceToken<TodosService>('todos');

function asIsoString(value: unknown): string {
  return new Date(value as string | number | Date).toISOString();
}

function toTodo(record: {
  id: number;
  title: string;
  dueAt: unknown;
  completed: unknown;
  expired: unknown;
}): TodoRecord {
  return {
    id: Number(record.id),
    title: String(record.title),
    dueAt: asIsoString(record.dueAt),
    completed: Boolean(record.completed),
    expired: Boolean(record.expired),
  };
}

/**
 * The todo domain: the table, its overdue rule and the ordering the list needs.
 * Routes translate these results into HTTP; this service knows nothing about
 * requests or response codes.
 */
export class TodosService {
  constructor(private readonly database: DatabaseManager) {}

  private repository() {
    return this.database.repository<TodoRecord>('todos');
  }

  async list(): Promise<TodoRecord[]> {
    const records = await this.repository().findMany({
      sort: (sort) => sort.field('dueAt').asc(),
    });
    return records.map(toTodo);
  }

  async get(id: number): Promise<TodoRecord | undefined> {
    const record = await this.repository().findOne({ filter: { id } });
    return record ? toTodo(record) : undefined;
  }

  async create(input: CreateTodoInput): Promise<TodoRecord> {
    const created = await this.repository().createOne({
      values: {
        title: input.title.trim(),
        dueAt: asIsoString(input.dueAt),
        completed: false,
        expired: new Date(input.dueAt).getTime() < Date.now(),
      },
    });
    return toTodo(created.record);
  }

  async update(
    id: number,
    input: UpdateTodoInput,
  ): Promise<TodoRecord | undefined> {
    const repository = this.repository();
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) {
      return undefined;
    }

    const values: {
      title?: string;
      dueAt?: string;
      completed?: boolean;
    } = {};
    if (input.title !== undefined) {
      values.title = input.title.trim();
    }
    if (input.dueAt !== undefined) {
      values.dueAt = asIsoString(input.dueAt);
    }
    if (input.completed !== undefined) {
      values.completed = input.completed;
    }

    const dueAt = values.dueAt ?? asIsoString(existing.dueAt);
    const completed = values.completed ?? Boolean(existing.completed);

    const updated = await repository.updateOne({
      filter: { id },
      values: {
        ...values,
        // Completion and expiry move together: a completed todo is never
        // overdue, and an unfinished one past its due time is.
        expired: !completed && new Date(dueAt).getTime() < Date.now(),
      },
    });
    return toTodo(updated.record);
  }

  async remove(id: number): Promise<boolean> {
    const repository = this.repository();
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) {
      return false;
    }
    await repository.deleteOne({ filter: { id } });
    return true;
  }

  async markOverdue(now = new Date()): Promise<RefreshOverdueResult> {
    const repository = this.repository();
    const records = await repository.findMany({
      sort: (sort) => sort.field('dueAt').asc(),
    });

    let updatedCount = 0;
    for (const record of records) {
      // Only an unfinished todo past its due time becomes overdue. Future and
      // completed records are left exactly as they are, so re-running the check
      // is idempotent and cannot rewrite an administrator's data.
      const overdue =
        !record.completed && new Date(record.dueAt).getTime() < now.getTime();
      if (!overdue || Boolean(record.expired)) {
        continue;
      }
      await repository.updateOne({
        filter: { id: record.id },
        values: { expired: true },
      });
      updatedCount += 1;
    }

    return {
      updatedCount,
      todos: await this.list(),
    };
  }
}
