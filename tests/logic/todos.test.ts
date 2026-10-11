// @vitest-environment node
import { databaseManagerToken, type SeedContext } from '@nocobase/db';
import {
  createTestAppConfig,
  type TestAppConfig,
} from '@nocobase/app-testing/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import todoSeed from '../../database/main/seeds/202610070002_default_todos.ts';
import { todoServiceToken } from '../../server/providers/todo.ts';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const servers: StandaloneServer[] = [];
const tempDirs: string[] = [];
const testConfigs: TestAppConfig[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(testConfigs.splice(0).map((config) => config.dispose()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('todos', () => {
  it('installs the default todos exactly once, however often the seed runs', async () => {
    const app = await createInstalledServer();
    const database = app.application.container.resolve(databaseManagerToken);

    const afterInstall = await database
      .query()
      .selectFrom('todos')
      .selectAll()
      .execute();
    expect(afterInstall).toHaveLength(3);

    // A repeat run of the seed must not duplicate the rows.
    await todoSeed.run({
      repository: (name: string) => database.repository(name),
    } as unknown as SeedContext);

    const afterSecondRun = await database
      .query()
      .selectFrom('todos')
      .selectAll()
      .execute();
    expect(afterSecondRun).toHaveLength(3);
  });

  it('marks only past-due, incomplete todos expired, and only once', async () => {
    const app = await createInstalledServer();
    const database = app.application.container.resolve(databaseManagerToken);
    const todos = app.application.container.resolve(todoServiceToken);

    expect(await todos.markExpired()).toBe(1);

    const rows = await database
      .query()
      .selectFrom('todos')
      .selectAll()
      .execute();
    const byTitle = new Map(rows.map((row) => [row.title, row]));
    const overdue = [...byTitle.values()].find(
      (row) => row.title === 'Submit the overdue quarterly report',
    );
    const future = [...byTitle.values()].find(
      (row) => row.title === 'Review the design draft next week',
    );
    const completed = [...byTitle.values()].find(
      (row) => row.title === 'Archive the completed meeting notes',
    );

    expect(overdue?.expired).toBeTruthy();
    expect(future?.expired).toBeFalsy();
    // Completed before its due time passed: the task must leave it labelled as it is.
    expect(completed?.expired).toBeFalsy();
    expect(completed?.completed).toBeTruthy();

    // A second run changes nothing, so a rapid cron cannot keep writing.
    expect(await todos.markExpired()).toBe(0);

    // A todo that becomes overdue later is picked up by a later run.
    await database
      .query()
      .updateTable('todos')
      .set({ dueAt: new Date(Date.now() - 1000) })
      .where('title', '=', 'Review the design draft next week')
      .execute();
    expect(await todos.markExpired()).toBe(1);
  });

  it('requires a session and never marks anything expired on a read', async () => {
    const app = await createInstalledServer();
    const database = app.application.container.resolve(databaseManagerToken);
    const baseUrl = `http://localhost${app.application.publicBasePath}`;

    const anonymous = await requestApp(app, `${baseUrl}/api/todos`);
    expect(anonymous.status).toBe(401);

    const cookie = await signIn(app, baseUrl);

    const list = await requestApp(app, `${baseUrl}/api/todos`, {
      headers: { cookie },
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      data: { id: string; title: string; expired: boolean }[];
      meta: { total: number };
    };
    expect(body.meta.total).toBe(3);
    expect(body.data).toHaveLength(3);
    // Reading the list must not mark the overdue todo: that is the scheduled task's write.
    expect(body.data.every((todo) => todo.expired === false)).toBe(true);

    const overdue = body.data.find(
      (todo) => todo.title === 'Submit the overdue quarterly report',
    );
    expect(overdue).toBeDefined();

    const updated = await requestApp(
      app,
      `${baseUrl}/api/todos/${overdue!.id}`,
      {
        method: 'PATCH',
        headers: {
          cookie,
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({ completed: true }),
      },
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: { id: overdue!.id, completed: true },
    });

    const invalid = await requestApp(
      app,
      `${baseUrl}/api/todos/${overdue!.id}`,
      {
        method: 'PATCH',
        headers: {
          cookie,
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({ completed: 'yes' }),
      },
    );
    expect(invalid.status).toBe(400);

    const missing = await requestApp(app, `${baseUrl}/api/todos/999999`, {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ completed: true }),
    });
    expect(missing.status).toBe(404);

    const rows = await database
      .query()
      .selectFrom('todos')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(3);
  });

  it('dispatches the expiry schedule through the Scheduler and records one occurrence', async () => {
    const app = await createInstalledServer();
    const database = app.application.container.resolve(databaseManagerToken);
    const baseUrl = `http://localhost${app.application.publicBasePath}`;
    const cookie = await signIn(app, baseUrl);

    const listed = await requestApp(
      app,
      `${baseUrl}/api/scheduler/schedules?pageSize=100`,
      { headers: { cookie } },
    );
    expect(listed.status).toBe(200);
    const schedules = (await listed.json()) as {
      data: {
        id: string;
        key: string;
        cron: string;
        enabled: boolean;
        targetState: string;
      }[];
    };
    const schedule = schedules.data.find(
      (item) => item.key === 'todos.check-expired',
    );
    expect(schedule).toBeDefined();
    // The plan and its enabled state survive the sync the application performs on start.
    expect(schedule!.enabled).toBe(true);
    expect(schedule!.targetState).toBe('ready');
    expect(schedule!.cron).toBe('* * * * *');

    // A firing is planned by the Scheduler, so a real dispatch is observed by waiting for the next minute rather
    // than by writing to the database. The occurrence below is the execution record the Scheduler wrote.
    const occurrence = await waitFor(async () => {
      const response = await requestApp(
        app,
        `${baseUrl}/api/scheduler/schedules/${schedule!.id}/occurrences?pageSize=10`,
        { headers: { cookie } },
      );
      if (response.status !== 200) return undefined;
      const page = (await response.json()) as {
        data: {
          status: string;
          resultSummary?: Record<string, unknown>;
        }[];
      };
      return page.data.find((item) => item.status === 'succeeded');
    }, 110_000);

    expect(occurrence.resultSummary?.expiredCount).toBe(1);

    const rows = await database
      .query()
      .selectFrom('todos')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(3);
    const overdue = rows.find(
      (row) => row.title === 'Submit the overdue quarterly report',
    );
    const future = rows.find(
      (row) => row.title === 'Review the design draft next week',
    );
    const completed = rows.find(
      (row) => row.title === 'Archive the completed meeting notes',
    );
    expect(overdue?.expired).toBeTruthy();
    expect(future?.expired).toBeFalsy();
    expect(completed?.expired).toBeFalsy();
  }, 150_000);
});

async function createInstalledServer(): Promise<StandaloneServer> {
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-todos-standalone-'),
  );
  tempDirs.push(databaseDir);
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const config = await writeRuntimeTestConfig(databaseDir);

  const server = await createStandaloneServer({
    env: {
      APP_CONFIG_FILE: config,
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
  servers.push(server);
  return server;
}

async function writeRuntimeTestConfig(directory: string): Promise<string> {
  const config = await createTestAppConfig({
    connections: ['main'],
    install: true,
    config: {
      auth: {
        secret: 'test-auth-secret-at-least-32-characters',
        // A cookie-authenticated write is refused unless its Origin is trusted; tests make requests by hand, so the
        // application has to be told which origin to trust.
        trustedOrigins: ['http://localhost'],
      },
      jobs: {
        default: 'memory',
        memory: {
          adapter: 'memory',
          persistence: { path: path.join(directory, 'jobs') },
        },
      },
      queue: {
        default: 'memory',
        memory: {
          adapter: 'inMemory',
          persistence: { path: path.join(directory, 'queue') },
        },
      },
      database: { connections: { main: { seeds: { autoRun: true } } } },
    },
  });
  testConfigs.push(config);
  return config.path;
}

async function signIn(app: StandaloneServer, baseUrl: string): Promise<string> {
  const response = await requestApp(
    app,
    `${baseUrl}/api/auth/sign-in/username`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
    },
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function requestApp(
  app: Pick<StandaloneServer, 'fetch'>,
  input: Request | string | URL,
  requestInit?: RequestInit,
): Response | Promise<Response> {
  const request =
    input instanceof Request ? input : new Request(input, requestInit);
  return app.fetch(request);
}

/** Waits for the Scheduler to plan and run the next firing of a short cycle. */
async function waitFor<T>(
  check: () => Promise<T | undefined>,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for the Scheduler`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
