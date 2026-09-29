// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseManagerToken } from '@nocobase/db';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.js';

const DEMO_PASSWORD = 'Service@12345';
const ADMIN_PASSWORD = 'admin123';
const PUBLIC_ORIGIN = 'http://localhost';

type Json = Record<string, unknown>;

let app: StandaloneServer;
let baseUrl: string;
let tempRoot: string;
const cookies: Record<string, string> = {};

function request(input: string, init: RequestInit = {}): Promise<Response> {
  return app.fetch(new Request(`${baseUrl}${input}`, init));
}

async function json<T = Json>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function signIn(username: string, password: string): Promise<string> {
  const response = await request('/api/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status, `sign-in for ${username}`).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

interface ServiceRequestInit extends RequestInit {
  bodyJson?: unknown;
}

function serviceApi(
  cookie: string,
  endpoint: string,
  init: ServiceRequestInit = {},
): Promise<Response> {
  const { bodyJson, ...rest } = init;
  const headers: Record<string, string> = {
    cookie,
    origin: PUBLIC_ORIGIN,
    ...((rest.headers as Record<string, string> | undefined) ?? {}),
  };
  const finalInit: RequestInit = { ...rest, headers };
  if (bodyJson !== undefined) {
    headers['content-type'] = 'application/json';
    finalInit.body = JSON.stringify(bodyJson);
  }
  return request(`/api/service${endpoint}`, finalInit);
}

function cookieFetch(
  cookie: string,
  endpoint: string,
  bodyJson?: unknown,
): Promise<Response> {
  return request(endpoint, {
    method: 'POST',
    headers: {
      cookie,
      origin: PUBLIC_ORIGIN,
      'content-type': 'application/json',
    },
    body: bodyJson === undefined ? undefined : JSON.stringify(bodyJson),
  });
}

beforeAll(async () => {
  tempRoot = mkdtempSync(path.join(tmpdir(), 'nb-service-routes-'));
  const databaseDir = path.join(tempRoot, 'database');
  const storageDir = path.join(tempRoot, 'storage');
  const configFile = path.join(tempRoot, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(databaseDir, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      service: { enableSampleData: true },
      hub: { host: { enabled: false } },
    }),
  );
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  app = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: configFile,
      APP_PUBLIC_ORIGIN: PUBLIC_ORIGIN,
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir,
    },
  });
  baseUrl = `http://localhost${app.application.publicBasePath}`;

  cookies.supervisor = await signIn('service.supervisor', DEMO_PASSWORD);
  cookies.alpha = await signIn('service.engineer.alpha', DEMO_PASSWORD);
  cookies.beta = await signIn('service.engineer.beta', DEMO_PASSWORD);
  cookies.observer = await signIn('service.observer', DEMO_PASSWORD);
  cookies.integration = await signIn('service.integration', DEMO_PASSWORD);
  cookies.admin = await signIn('nocobase', ADMIN_PASSWORD);
}, 300_000);

afterAll(async () => {
  await app?.close();
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}, 60_000);

describe('service desk HTTP surface', () => {
  it('rejects anonymous callers before any business logic runs', async () => {
    const response = await request('/api/service/tickets', {
      headers: { origin: PUBLIC_ORIGIN },
    });
    expect(response.status).toBe(401);
  });

  it('exposes the seeded customers, devices and tickets to staff', async () => {
    const customers = await json<{ data: unknown[] }>(
      await serviceApi(cookies.supervisor, '/customers'),
    );
    expect(customers.data.length).toBeGreaterThanOrEqual(3);

    const devices = await json<{ data: unknown[] }>(
      await serviceApi(cookies.supervisor, '/devices'),
    );
    expect(devices.data.length).toBeGreaterThanOrEqual(6);

    const tickets = await json<{ total: number }>(
      await serviceApi(cookies.supervisor, '/tickets?pageSize=100'),
    );
    expect(tickets.total).toBeGreaterThanOrEqual(6);

    const integration = await serviceApi(cookies.integration, '/customers');
    expect(integration.status).toBe(403);
  });

  it('runs the ticket life cycle over HTTP with the right readers at each step', async () => {
    const engineers = await json<{
      data: { id: string; username?: string | null }[];
    }>(await serviceApi(cookies.supervisor, '/engineers'));
    const alphaId = engineers.data.find(
      (engineer) => engineer.username === 'service.engineer.alpha',
    )?.id;
    const betaId = engineers.data.find(
      (engineer) => engineer.username === 'service.engineer.beta',
    )?.id;
    expect(alphaId).toBeTruthy();
    expect(betaId).toBeTruthy();

    const created = await serviceApi(cookies.supervisor, '/tickets', {
      method: 'POST',
      bodyJson: {
        title: 'HTTP life cycle air compressor',
        description: 'Created through the ticket route.',
        customerId: 1,
        deviceId: 1,
        priority: 'urgent',
      },
    });
    expect(created.status).toBe(201);
    const ticket = (
      await json<{ data: { id: number; status: string } }>(created)
    ).data;
    expect(ticket.status).toBe('pending_acceptance');

    const accepted = await serviceApi(
      cookies.supervisor,
      `/tickets/${ticket.id}/accept`,
      { method: 'POST', bodyJson: { note: 'Accepted over HTTP.' } },
    );
    expect(accepted.status).toBe(200);
    const acceptedBody = await json<{
      data: { status: string; assigneeId: string | null };
    }>(accepted);
    expect(acceptedBody.data.status).toBe('pending_processing');
    expect(acceptedBody.data.assigneeId).toBe(alphaId);

    // The observer may not open a ticket that is still in flight.
    expect(
      (await serviceApi(cookies.observer, `/tickets/${ticket.id}`)).status,
    ).toBe(403);

    // An unrelated engineer cannot start processing someone else's ticket.
    expect(
      (
        await serviceApi(cookies.beta, `/tickets/${ticket.id}/start`, {
          method: 'POST',
          bodyJson: { note: 'not mine' },
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await serviceApi(cookies.alpha, `/tickets/${ticket.id}/start`, {
          method: 'POST',
          bodyJson: { note: 'Started.' },
        })
      ).status,
    ).toBe(200);

    const submitted = await serviceApi(
      cookies.alpha,
      `/tickets/${ticket.id}/submit`,
      { method: 'POST', bodyJson: { resultNote: 'Repaired and tested.' } },
    );
    expect(submitted.status).toBe(200);
    expect(
      (await json<{ data: { status: string } }>(submitted)).data.status,
    ).toBe('pending_confirmation');

    const closed = await serviceApi(
      cookies.supervisor,
      `/tickets/${ticket.id}/confirm`,
      { method: 'POST', bodyJson: { note: 'Confirmed.' } },
    );
    expect(closed.status).toBe(200);
    expect((await json<{ data: { status: string } }>(closed)).data.status).toBe(
      'closed',
    );

    // Observers get the closed summary, never the internal notes.
    const summary = await json<{
      data: { summaryOnly?: boolean; resultNote?: string | null };
    }>(await serviceApi(cookies.observer, `/tickets/${ticket.id}`));
    expect(summary.data.summaryOnly).toBe(true);
    expect(summary.data.resultNote).toBeUndefined();

    // Temporary read-only collaboration, then processing is still refused.
    const shared = await serviceApi(
      cookies.supervisor,
      `/tickets/${ticket.id}/shares`,
      { method: 'POST', bodyJson: { engineerId: betaId } },
    );
    expect(shared.status).toBe(201);
    expect(
      (await serviceApi(cookies.beta, `/tickets/${ticket.id}`)).status,
    ).toBe(200);
    expect(
      (
        await serviceApi(cookies.beta, `/tickets/${ticket.id}/start`, {
          method: 'POST',
          bodyJson: { note: 'should not work' },
        })
      ).status,
    ).toBe(403);
  });

  it('keeps knowledge drafts to the supervisor and serves device manuals to staff', async () => {
    const draft = await serviceApi(cookies.supervisor, '/knowledge/articles', {
      method: 'POST',
      bodyJson: {
        title: 'HTTP draft article',
        body: 'Internal torque table.',
        published: false,
      },
    });
    expect(draft.status).toBe(201);
    const draftId = (await json<{ data: { id: number } }>(draft)).data.id;

    expect(
      (await serviceApi(cookies.alpha, `/knowledge/articles/${draftId}`))
        .status,
    ).toBe(404);

    const published = await serviceApi(
      cookies.supervisor,
      `/knowledge/articles/${draftId}`,
      { method: 'PATCH', bodyJson: { published: true } },
    );
    expect(published.status).toBe(200);
    expect(
      (await serviceApi(cookies.alpha, `/knowledge/articles/${draftId}`))
        .status,
    ).toBe(200);

    // Engineers cannot author knowledge.
    expect(
      (
        await serviceApi(cookies.alpha, '/knowledge/articles', {
          method: 'POST',
          bodyJson: { title: 'Engineer-authored article' },
        })
      ).status,
    ).toBe(403);

    const manuals = await json<{ data: unknown[] }>(
      await serviceApi(cookies.alpha, '/knowledge/manuals'),
    );
    expect(manuals.data.length).toBeGreaterThanOrEqual(2);
  });

  it('provisions the device-manual knowledge base and opens maintenance to supervisors', async () => {
    const supervisor = await json<{
      data: { knowledgeBaseKey: string; canManage: boolean };
    }>(
      await serviceApi(cookies.supervisor, '/knowledge/manual-knowledge-base'),
    );
    expect(supervisor.data).toEqual({
      knowledgeBaseKey: 'device-manuals',
      canManage: true,
    });

    // An engineer reads the manuals but must not be offered the write controls.
    const engineer = await json<{
      data: { knowledgeBaseKey: string; canManage: boolean };
    }>(await serviceApi(cookies.alpha, '/knowledge/manual-knowledge-base'));
    expect(engineer.data.canManage).toBe(false);

    expect(
      (await request('/api/service/knowledge/manual-knowledge-base')).status,
    ).toBe(401);

    // The provider created the LOCAL knowledge base and ingested both manuals.
    const bases = await json<{
      data: { data?: { key?: string }[] } | { key?: string }[];
    }>(
      await request(
        '/api/ai/aiKnowledgeBase:list?paginate=false&filter[key]=device-manuals',
        { headers: { cookie: cookies.supervisor, origin: PUBLIC_ORIGIN } },
      ),
    );
    const baseRows = Array.isArray(bases.data)
      ? bases.data
      : (bases.data.data ?? []);
    expect(baseRows.some((base) => base.key === 'device-manuals')).toBe(true);

    const documents = await json<{
      data:
        | { data?: { knowledgeBaseKey?: string }[] }
        | {
            knowledgeBaseKey?: string;
          }[];
    }>(
      await request(
        '/api/ai/aiKnowledgeBaseDocs:list?paginate=false&filter[knowledgeBaseKey]=device-manuals',
        { headers: { cookie: cookies.supervisor, origin: PUBLIC_ORIGIN } },
      ),
    );
    const documentRows = Array.isArray(documents.data)
      ? documents.data
      : (documents.data.data ?? []);
    expect(documentRows.length).toBeGreaterThanOrEqual(2);

    // The service assistant is bound to that knowledge base.
    const employees = await json<
      {
        username?: string;
        enableKnowledgeBase?: boolean;
        knowledgeBase?: { knowledgeBaseKeys?: string[] };
      }[]
    >(
      await request('/api/ai/aiEmployees:list', {
        headers: { cookie: cookies.admin, origin: PUBLIC_ORIGIN },
      }),
    );
    const assistant = employees.find(
      (employee) => employee.username === 'service-assistant',
    );
    expect(assistant?.enableKnowledgeBase).toBe(true);
    expect(assistant?.knowledgeBase?.knowledgeBaseKeys).toContain(
      'device-manuals',
    );
  });

  it('guards attachments so only an authorized reader may stream a file', async () => {
    const created = await serviceApi(cookies.supervisor, '/tickets', {
      method: 'POST',
      bodyJson: {
        title: 'HTTP attachment ticket',
        customerId: 1,
        deviceId: 1,
      },
    });
    const ticketId = (await json<{ data: { id: number } }>(created)).data.id;
    await serviceApi(cookies.supervisor, `/tickets/${ticketId}/accept`, {
      method: 'POST',
      bodyJson: {},
    });

    const form = new FormData();
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    form.append('file', new File([bytes], 'photo.png', { type: 'image/png' }));
    const upload = await serviceApi(
      cookies.alpha,
      `/tickets/${ticketId}/attachments`,
      { method: 'POST', body: form },
    );
    expect(upload.status).toBe(201);
    const attachment = (
      await json<{ data: { id: number; filename: string } }>(upload)
    ).data;
    expect(attachment.filename).toBe('photo.png');

    const content = await serviceApi(
      cookies.alpha,
      `/tickets/${ticketId}/attachments/${attachment.id}/content`,
    );
    expect(content.status).toBe(200);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(bytes);

    // The URL is not a capability: an unrelated engineer is refused.
    expect(
      (
        await serviceApi(
          cookies.beta,
          `/tickets/${ticketId}/attachments/${attachment.id}/content`,
        )
      ).status,
    ).toBe(403);

    const removed = await serviceApi(
      cookies.alpha,
      `/tickets/${ticketId}/attachments/${attachment.id}`,
      { method: 'DELETE' },
    );
    expect(removed.status).toBe(200);
  });

  it('scopes the dashboard to the caller', async () => {
    const supervisor = await json<{ data: { scope: string; counts: unknown } }>(
      await serviceApi(cookies.supervisor, '/dashboard'),
    );
    expect(supervisor.data.scope).toBe('all');

    const beta = await json<{ data: { scope: string } }>(
      await serviceApi(cookies.beta, '/dashboard'),
    );
    expect(beta.data.scope).toBe('own');

    expect((await serviceApi(cookies.observer, '/dashboard')).status).toBe(403);
  });

  it('limits the manual daily job trigger to supervisors', async () => {
    expect(
      (
        await serviceApi(cookies.alpha, '/inspections/run-daily', {
          method: 'POST',
          bodyJson: {},
        })
      ).status,
    ).toBe(403);

    const run = await serviceApi(cookies.supervisor, '/inspections/run-daily', {
      method: 'POST',
      bodyJson: {},
    });
    expect(run.status).toBe(200);
    const body = await json<{
      data: {
        generation: { date: string } | null;
        reminders: { date: string } | null;
        executions: { key: string; state: string; occurrenceId?: string }[];
      };
    }>(run);
    // A manual trigger runs the Scheduler schedules, so it reports the same
    // business day and a terminal, successful execution for each.
    expect(body.data.generation?.date).toBe(body.data.reminders?.date);
    expect(body.data.executions.map((execution) => execution.state)).toEqual([
      'succeeded',
      'succeeded',
    ]);
    for (const execution of body.data.executions) {
      expect(execution.occurrenceId).toBeTruthy();
    }

    // The run is real Scheduler history, not a direct call to the business
    // step: the plan has an occurrence and its trigger count moved.
    const database = app.application.container.resolve(databaseManagerToken);
    const definition = await database
      .query()
      .selectFrom('schedule_definitions')
      .select(['id'])
      .where('key', '=', 'service-inspection-daily')
      .executeTakeFirst();
    expect(definition?.id).toBeTruthy();
    const occurrence = await database
      .query()
      .selectFrom('schedule_occurrences')
      .select(['status'])
      .where('scheduleId', '=', String(definition?.id))
      .orderBy('startedAt', 'desc')
      .executeTakeFirst();
    expect(occurrence?.status).toBe('succeeded');
    const schedule = await database
      .query()
      .selectFrom('queue_schedules')
      .select(['run_count'])
      .where('id', '=', String(definition?.id))
      .executeTakeFirst();
    expect(Number(schedule?.run_count ?? 0)).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('accepts device-platform repair requests and deduplicates the event', async () => {
    const keyCreated = await cookieFetch(
      cookies.integration,
      '/api/auth/api-key/create',
      { name: 'route-test-key' },
    );
    expect(keyCreated.status).toBe(200);
    const key = await json<{ id: string; key: string }>(keyCreated);

    const headers = { 'x-api-key': key.key, origin: PUBLIC_ORIGIN };
    const first = await request('/api/service/external/repair-requests', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        externalEventNo: 'ROUTE-EXT-001',
        deviceCode: 'DEV-AQ-001',
        title: 'External route alarm',
        priority: 'urgent',
      }),
    });
    expect(first.status).toBe(201);
    const firstBody = await json<{
      data: { id: number };
      deduplicated: boolean;
    }>(first);
    expect(firstBody.deduplicated).toBe(false);

    const second = await request('/api/service/external/repair-requests', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        externalEventNo: 'ROUTE-EXT-001',
        deviceCode: 'DEV-AQ-001',
        title: 'External route alarm again',
      }),
    });
    expect(second.status).toBe(200);
    const secondBody = await json<{
      data: { id: number };
      deduplicated: boolean;
    }>(second);
    expect(secondBody.deduplicated).toBe(true);
    expect(secondBody.data.id).toBe(firstBody.data.id);

    // An engineer's cookie may not use the integration surface.
    expect(
      (
        await serviceApi(cookies.alpha, '/external/repair-requests', {
          method: 'POST',
          bodyJson: {
            externalEventNo: 'ROUTE-EXT-002',
            deviceCode: 'DEV-AQ-001',
            title: 'Engineer attempt',
          },
        })
      ).status,
    ).toBe(403);

    const revoked = await cookieFetch(
      cookies.integration,
      '/api/auth/api-key/delete',
      { keyId: key.id },
    );
    expect(revoked.status).toBe(200);
    const afterRevoke = await request('/api/service/external/tickets/1', {
      headers,
    });
    expect(afterRevoke.status).toBe(401);
  });

  it('rejects a disabled integration user holding a fresh key', async () => {
    const keyCreated = await cookieFetch(
      cookies.integration,
      '/api/auth/api-key/create',
      { name: 'route-test-key-disabled' },
    );
    const key = await json<{ id: string; key: string }>(keyCreated);

    const database = app.application.container.resolve(databaseManagerToken);
    const integration = await database
      .repository<{ id: string }>('user')
      .findOne({ filter: { username: 'service.integration' } });
    expect(integration?.id).toBeTruthy();

    const disabled = await request(
      `/api/users/${String(integration?.id)}/disable`,
      {
        method: 'POST',
        headers: {
          cookie: cookies.admin,
          origin: PUBLIC_ORIGIN,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );
    expect(disabled.status).toBe(200);

    const rejected = await request('/api/service/external/tickets/1', {
      headers: { 'x-api-key': key.key, origin: PUBLIC_ORIGIN },
    });
    expect(rejected.status).toBe(401);
  });
});
