import {
  databaseManagerToken,
  RepositoryError,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

/** A todo row as stored. `seedKey` marks the example rows and never leaves the server. */
export interface TodoRecord {
  id: number;
  title: string;
  notes: string | null;
  completed: boolean;
  seedKey: string | null;
  createdAt: Date;
}

export type TodoStatus = 'all' | 'active' | 'completed';

export interface TodoCreateInput {
  title: string;
  notes: string | null;
}

export interface TodoUpdateInput {
  title?: string;
  notes?: string | null;
  completed?: boolean;
}

export const todoServiceToken = createServiceToken<TodoService>('todos');

/**
 * Reads and writes the todo list. It owns no per-user ownership: the list is
 * shared, which is what "no permission differentiation" means here.
 */
export class TodoService {
  private readonly repository: Repository<TodoRecord>;

  constructor(database: DatabaseManager) {
    this.repository = database.repository<TodoRecord>('todos');
  }

  list(status: TodoStatus = 'all'): Promise<TodoRecord[]> {
    const filter =
      status === 'active'
        ? { completed: false }
        : status === 'completed'
          ? { completed: true }
          : undefined;

    return Promise.resolve(
      this.repository.findMany({
        ...(filter ? { filter } : {}),
        sort: (sort) => [
          sort.field('createdAt').desc(),
          sort.field('id').desc(),
        ],
      }),
    );
  }

  get(id: number): Promise<TodoRecord | undefined> {
    return this.repository.findOne({ filter: { id } });
  }

  async create(input: TodoCreateInput): Promise<TodoRecord> {
    // A `datetime` field has no database default, so creation time is set here.
    const values: Partial<TodoRecord> = {
      title: input.title,
      notes: input.notes,
      completed: false,
      createdAt: new Date(),
    };
    const { record } = await this.repository.createOne({ values });
    return record;
  }

  async update(
    id: number,
    changes: TodoUpdateInput,
  ): Promise<TodoRecord | undefined> {
    const values: Partial<TodoRecord> = {};
    if (changes.title !== undefined) {
      values.title = changes.title;
    }
    if (changes.notes !== undefined) {
      values.notes = changes.notes;
    }
    if (changes.completed !== undefined) {
      values.completed = changes.completed;
    }

    if (Object.keys(values).length === 0) {
      return this.get(id);
    }

    try {
      const { record } = await this.repository.updateOne({
        filter: { id },
        values,
      });
      return record;
    } catch (error) {
      if (
        error instanceof RepositoryError &&
        error.code === 'RECORD_NOT_FOUND'
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async remove(id: number): Promise<boolean> {
    try {
      await this.repository.deleteOne({ filter: { id } });
      return true;
    } catch (error) {
      if (
        error instanceof RepositoryError &&
        error.code === 'RECORD_NOT_FOUND'
      ) {
        return false;
      }
      throw error;
    }
  }
}

export class TodoServiceProvider extends ServiceProvider<Application> {
  readonly name = 'todos';

  register(): void {
    this.app.container.singleton(todoServiceToken, (container) => {
      return new TodoService(container.resolve(databaseManagerToken));
    });
  }
}
