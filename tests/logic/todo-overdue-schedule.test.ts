// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '@nocobase/app-testing/server';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';

import { createStandaloneServer } from '../../server/standalone.ts';
import {
  TODO_OVERDUE_SCHEDULE_KEY,
  TODO_OVERDUE_TARGET,
  todoServiceToken,
  type TodoItemRecord,
  type TodoService,
  type TodoView,
} from '../../server/providers/todos.ts';

/** The subset of a schedule the test reads, which the plugin's public service type narrows out. */
interface ScheduleListing {
  readonly id: string;
  readonly key: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly targetType: string;
  readonly targetState: string;
  readonly nextRunAt?: string;
}

interface OccurrenceListing {
  readonly status: string;
  readonly startedAt: string;
  readonly resultSummary?: unknown;
}

/** The scheduler's read side, reachable through the container but not through its narrow public type. */
interface SchedulerReadModel {
  list(): Promise<readonly ScheduleListing[]>;
  listOccurrences(id: string): Promise<readonly OccurrenceListing[]>;
  setEnabled(id: string, enabled: boolean): Promise<ScheduleListing>;
  sync(finalize?: boolean): Promise<void>;
}

let app: TestApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function startApp(): Promise<TestApp> {
  app = await createTestApp({
    createServer: createStandaloneServer,
    // The application's own `config.yml` supplies its secret in development; a test config file has to as well, or
    // the authentication provider refuses to build.
    config: {
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
    },
  });
  return app;
}

function readModel(testApp: TestApp): SchedulerReadModel {
  return testApp.application.container.resolve(
    schedulerServiceToken,
  ) as unknown as SchedulerReadModel;
}

async function signIn(testApp: TestApp): Promise<string> {
  const response = await testApp.request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function allTodos(todos: TodoService): Promise<readonly TodoView[]> {
  const page = await todos.list({ page: 1, pageSize: 100 });
  return page.items;
}

function keyedByTitle(todos: readonly TodoView[]): Map<string, TodoView> {
  return new Map(todos.map((todo) => [todo.title, todo]));
}

/**
 * The overdue rule is a business rule, not an HTTP endpoint: it changes records only when a schedule fires. These
 * tests drive the same service the schedule's target calls, assert the rule itself, and check that the schedule
 * exists — and then let the real scheduler fire it once.
 */
describe('overdue todo marking', () => {
  it('marks only uncompleted todos whose due time has passed, and only once', async () => {
    const testApp = await startApp();
    const todos = testApp.application.container.resolve(todoServiceToken);
    const repository = testApp.database.repository<TodoItemRecord>('todoItems');

    await repository.createOne({
      values: {
        title: 'Past and open',
        dueAt: new Date('2020-01-01T00:00:00.000Z'),
        completed: false,
        overdue: false,
      },
    });
    await repository.createOne({
      values: {
        title: 'Future and open',
        dueAt: new Date('2099-12-31T23:59:59.000Z'),
        completed: false,
        overdue: false,
      },
    });
    await repository.createOne({
      values: {
        title: 'Past and completed',
        dueAt: new Date('2020-06-01T00:00:00.000Z'),
        completed: true,
        overdue: false,
      },
    });
    const before = await todos.list({ page: 1, pageSize: 100 });
    expect(before.total).toBe(3);

    // A fixed reference time keeps the assertion independent of when the test runs.
    const marked = await todos.markOverdue(
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(marked).toEqual({ marked: 1 });

    const byTitle = keyedByTitle(await allTodos(todos));
    expect(byTitle.get('Past and open')).toMatchObject({
      overdue: true,
      completed: false,
    });
    expect(byTitle.get('Future and open')).toMatchObject({
      overdue: false,
      completed: false,
    });
    expect(byTitle.get('Past and completed')).toMatchObject({
      overdue: false,
      completed: true,
    });

    // Re-running the schedule is a no-op: the flag is already set and nothing is written.
    await expect(
      todos.markOverdue(new Date('2026-01-01T00:00:00.000Z')),
    ).resolves.toEqual({ marked: 0 });

    // No run ever inserts a record, so the sample and business rows stay the only ones.
    const after = await todos.list({ page: 1, pageSize: 100 });
    expect(after.total).toBe(3);
  });

  it('registers the schedule that runs the overdue rule and enables it', async () => {
    const testApp = await startApp();

    const schedule = (await readModel(testApp).list()).find(
      (item) => item.key === TODO_OVERDUE_SCHEDULE_KEY,
    );

    expect(schedule).toBeDefined();
    expect(schedule).toMatchObject({
      cron: '* * * * *',
      timezone: 'UTC',
      enabled: true,
      targetType: TODO_OVERDUE_TARGET,
      targetState: 'ready',
    });
  });

  it('serves the list to a signed-in user and refuses anonymous callers', async () => {
    const testApp = await startApp();
    const repository = testApp.database.repository<TodoItemRecord>('todoItems');
    await repository.createOne({
      values: {
        title: 'Listed todo',
        dueAt: new Date('2020-01-01T00:00:00.000Z'),
        completed: false,
        overdue: false,
      },
    });

    const anonymous = await testApp.request('/todos');
    expect(anonymous.status).toBe(401);

    const cookie = await signIn(testApp);

    const response = await testApp.request('/todos', { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: readonly TodoView[];
      meta: { page: number; pageSize: number; total: number };
    };
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(body.data).toEqual([
      {
        id: expect.any(Number),
        title: 'Listed todo',
        dueAt: '2020-01-01T00:00:00.000Z',
        completed: false,
        overdue: false,
      },
    ]);
  });

  it('persists a disabled schedule when the manifest is re-synced', async () => {
    const testApp = await startApp();
    const scheduler = readModel(testApp);
    const schedule = (await scheduler.list()).find(
      (item) => item.key === TODO_OVERDUE_SCHEDULE_KEY,
    )!;

    await scheduler.setEnabled(schedule.id, false);
    expect(
      (await scheduler.list()).find((item) => item.id === schedule.id),
    ).toMatchObject({ enabled: false });

    // A later start reconciles the same code manifest again. It must keep the administrator's choice rather than
    // reset the schedule to the enabled default it is created with.
    await scheduler.sync();
    expect(
      (await scheduler.list()).find((item) => item.id === schedule.id),
    ).toMatchObject({ enabled: false });
  });

  // The rule runs the same way whether a test calls the service or the scheduler calls it, which is the point: this
  // lets the real executor fire the real schedule, so the registration, the target and the occurrence history are
  // all exercised rather than assumed. The cron is the controlled one-minute interval, so a firing lands within a
  // minute of the schedule's next run.
  it('fires the real schedule and records the execution', async () => {
    const testApp = await startApp();
    const repository = testApp.database.repository<TodoItemRecord>('todoItems');
    await repository.createOne({
      values: {
        title: 'Real firing check',
        dueAt: new Date('2020-01-01T00:00:00.000Z'),
        completed: false,
        overdue: false,
      },
    });
    const scheduler = readModel(testApp);
    const schedule = (await scheduler.list()).find(
      (item) => item.key === TODO_OVERDUE_SCHEDULE_KEY,
    )!;

    const deadline = Date.now() + 150_000;
    let occurrences: readonly OccurrenceListing[] = [];
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      occurrences = await scheduler.listOccurrences(schedule.id);
      if (occurrences.some((occurrence) => occurrence.status === 'succeeded')) {
        break;
      }
    }

    expect(
      occurrences.some((occurrence) => occurrence.status === 'succeeded'),
    ).toBe(true);
    const row = await repository.findOne({
      filter: { title: 'Real firing check' },
    });
    expect(row).toMatchObject({ overdue: true });
  }, 180_000);
});
