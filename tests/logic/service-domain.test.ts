// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';

import { databaseManagerToken } from '@nocobase/db';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

const PASSWORD = 'Service@123';
const ACCOUNTS = {
  supervisor: 'supervisor',
  engineerA: 'engineer.a',
  engineerB: 'engineer.b',
  observer: 'observer',
  integration: 'integration',
} as const;

interface WorkOrder {
  id: number;
  orderNo: string;
  status: string;
  priority: string;
  confidential: boolean;
  assigneeId?: string;
  deviceId?: number;
  activities?: Array<{ action: string }>;
  attachments?: Array<{
    id: string;
    category: string;
    filename?: string;
    mimeType?: string;
    ext?: string;
  }>;
  shares?: Array<{ engineerId: string }>;
}

interface Context {
  userId: string;
  role: Record<string, boolean>;
}

let server: StandaloneServer;
let baseUrl: string;
let directory: string;
const cookies: Record<string, string> = {};
const userIds: Record<string, string> = {};

function configFile(target: string): string {
  const file = path.join(target, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(target, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );
  return file;
}

async function request(
  route: string,
  options: {
    method?: string;
    actor?: keyof typeof ACCOUNTS;
    json?: unknown;
    form?: FormData;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  const headers = new Headers(options.headers ?? {});
  if (options.actor) {
    headers.set('cookie', cookies[options.actor]);
  }
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.json);
  }
  if (options.form) {
    body = options.form;
  }
  const method = options.method ?? 'GET';
  if (method !== 'GET') {
    // The application rejects a state-changing request from another origin, and
    // an Origin header carries the scheme and host without a path.
    headers.set('origin', new URL(baseUrl).origin);
  }
  return server.fetch(
    new Request(`${baseUrl}${route}`, { method, headers, body }),
  );
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function signIn(actor: keyof typeof ACCOUNTS): Promise<void> {
  const response = await request('/api/auth/sign-in/username', {
    method: 'POST',
    json: { username: ACCOUNTS[actor], password: PASSWORD },
  });
  expect(response.status).toBe(200);
  cookies[actor] = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  const context = await readJson<{ data: Context }>(
    await request('/api/service/context', { actor }),
  );
  userIds[actor] = context.data.userId;
}

async function listOrders(actor: keyof typeof ACCOUNTS): Promise<WorkOrder[]> {
  const response = await request('/api/service/work-orders', { actor });
  expect(response.status).toBe(200);
  return (await readJson<{ data: WorkOrder[] }>(response)).data;
}

async function findOrder(
  actor: keyof typeof ACCOUNTS,
  predicate: (order: WorkOrder) => boolean,
): Promise<WorkOrder> {
  const order = (await listOrders(actor)).find(predicate);
  expect(order).toBeDefined();
  return order as WorkOrder;
}

async function transition(
  actor: keyof typeof ACCOUNTS,
  id: number,
  action: string,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  return request(`/api/service/work-orders/${String(id)}/transition`, {
    method: 'POST',
    actor,
    json: { action, ...extra },
  });
}

async function dispatchCount(pattern: string): Promise<number> {
  const manager = server.application.container.resolve(databaseManagerToken);
  const client = await manager.connection('main').client<Knex>();
  const row = await client('notification_dispatches')
    .where('idempotency_key', 'like', pattern)
    .count<{ count: number | string }[]>({ count: '*' })
    .first();
  return Number(row?.count ?? 0);
}

interface ScheduleOccurrence {
  id: string;
  status: string;
  reason?: string;
  resultSummary?: { created?: number; sent?: number };
}

const TERMINAL_SCHEDULE_STATES = new Set([
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
  'timed_out',
]);

async function listScheduleOccurrences(
  scheduleId: string,
): Promise<ScheduleOccurrence[]> {
  const response = await request(`/api/schedules/${scheduleId}/occurrences`, {
    actor: 'supervisor',
  });
  expect(response.status).toBe(200);
  return (await readJson<{ data: ScheduleOccurrence[] }>(response)).data;
}

/** Wait for the occurrence this run just dispatched, not an earlier one. */
async function waitForNewOccurrence(
  scheduleId: string,
  known: ReadonlySet<string>,
): Promise<ScheduleOccurrence> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const occurrences = await listScheduleOccurrences(scheduleId);
    const fresh = occurrences.find(
      (occurrence) =>
        !known.has(occurrence.id) &&
        TERMINAL_SCHEDULE_STATES.has(occurrence.status),
    );
    if (fresh) {
      return fresh;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the schedule occurrence.');
}

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'nocobase-service-domain-'));
  server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_SERVER_PORT: '0',
      APP_SERVER_START_LOG: 'false',
      APP_PUBLIC_ORIGIN: 'http://localhost',
      APP_CONFIG_FILE: configFile(directory),
    },
    paths: {
      rootDir: process.cwd(),
      serverDir: path.join(process.cwd(), 'server'),
      databaseDir: path.join(process.cwd(), 'database'),
      clientDir: path.join(process.cwd(), 'dist/client'),
      storageDir: path.join(directory, 'storage'),
    },
  });
  baseUrl = `http://localhost${server.application.publicBasePath}`;
  for (const actor of Object.keys(ACCOUNTS) as Array<keyof typeof ACCOUNTS>) {
    await signIn(actor);
  }
}, 180_000);

afterAll(async () => {
  await server?.close();
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('service domain', () => {
  it('seeds the demo data and scopes each role to what it may see', async () => {
    const supervisorOrders = await listOrders('supervisor');
    expect(supervisorOrders.length).toBeGreaterThanOrEqual(6);

    const anonymous = await request('/api/service/work-orders');
    expect(anonymous.status).toBe(401);

    const observerOrders = await listOrders('observer');
    expect(observerOrders.some((order) => order.confidential)).toBe(false);
    expect(supervisorOrders.some((order) => order.confidential)).toBe(true);

    const dashboard = await readJson<{
      data: { role: string; counts: Record<string, number> };
    }>(await request('/api/service/dashboard', { actor: 'engineerA' }));
    expect(dashboard.data.role).toBe('engineer');

    // The integration identity reads its own submissions only.
    const integrationOrders = await listOrders('integration');
    expect(
      integrationOrders.every((order) => order.assigneeId === undefined),
    ).toBe(true);
  });

  it('refuses a duplicate serial and a mismatched customer/device readably', async () => {
    const stamp = Date.now();
    const createCustomer = async (name: string): Promise<number> => {
      const response = await request('/api/service/customers', {
        method: 'POST',
        actor: 'supervisor',
        json: { name },
      });
      expect(response.status).toBe(201);
      return (await readJson<{ data: { id: number } }>(response)).data.id;
    };
    const owner = await createCustomer(`测试客户A-${String(stamp)}`);
    const other = await createCustomer(`测试客户B-${String(stamp)}`);
    const serialNumber = `SN-TEST-${String(stamp)}`;

    const created = await request('/api/service/devices', {
      method: 'POST',
      actor: 'supervisor',
      json: { serialNumber, name: '测试设备', customerId: owner },
    });
    expect(created.status).toBe(201);
    const device = (await readJson<{ data: { id: number } }>(created)).data;

    // The serial number is unique, so the second create is a readable conflict
    // rather than a raw database error surfacing as a 500.
    const duplicate = await request('/api/service/devices', {
      method: 'POST',
      actor: 'supervisor',
      json: { serialNumber, name: '重复设备', customerId: owner },
    });
    expect(duplicate.status).toBe(409);
    const duplicateBody = await readJson<{ code?: string; message?: string }>(
      duplicate,
    );
    expect(duplicateBody.code).toBe('DEVICE_SERIAL_DUPLICATE');
    expect(duplicateBody.message).toBeTruthy();

    // A work order cannot bind a device to a customer that does not own it.
    const mismatch = await request('/api/service/work-orders', {
      method: 'POST',
      actor: 'supervisor',
      json: {
        title: '客户与设备不匹配',
        customerId: other,
        deviceId: device.id,
        idempotencyKey: `test-mismatch-${String(stamp)}`,
      },
    });
    expect(mismatch.status).toBe(409);
    const mismatchBody = await readJson<{ code?: string; message?: string }>(
      mismatch,
    );
    expect(mismatchBody.code).toBe('CUSTOMER_DEVICE_MISMATCH');
    expect(mismatchBody.message).toBeTruthy();

    // The matching pair is still accepted, so the check is not over-broad.
    const matching = await request('/api/service/work-orders', {
      method: 'POST',
      actor: 'supervisor',
      json: {
        title: '客户与设备匹配',
        customerId: owner,
        deviceId: device.id,
        idempotencyKey: `test-match-${String(stamp)}`,
      },
    });
    expect(matching.status).toBe(201);
    expect((await readJson<{ data: WorkOrder }>(matching)).data.status).toBe(
      'pending_accept',
    );
  });

  it('requires a customer when creating a device instead of failing as a 500', async () => {
    const missing = await request('/api/service/devices', {
      method: 'POST',
      actor: 'supervisor',
      json: {
        serialNumber: `SN-NOCUST-${String(Date.now())}`,
        name: '无客户设备',
      },
    });
    // The missing customer is a validation failure, not an unhandled database
    // NOT NULL violation surfacing as a 500.
    expect(missing.status).toBe(400);
    const body = await readJson<{ code?: string; message?: string }>(missing);
    expect(body.code).toBe('DEVICE_CUSTOMER_REQUIRED');
    expect(body.message).toBeTruthy();

    // A serial number and a name are required the same way.
    const noSerial = await request('/api/service/devices', {
      method: 'POST',
      actor: 'supervisor',
      json: { serialNumber: '', name: '无编号设备', customerId: 1 },
    });
    expect(noSerial.status).toBe(400);
  });

  it('accepts an urgent work order once and notifies the assignee once', async () => {
    const device = (
      await readJson<{ data: Array<{ id: number }> }>(
        await request('/api/service/devices', { actor: 'supervisor' }),
      )
    ).data[0];
    expect(device).toBeDefined();
    const payload = {
      title: '加急：液压站异响',
      description: '客户反馈液压站运行时出现异响，需要立刻上门。',
      deviceId: device?.id,
      priority: 'urgent',
      assigneeId: userIds.engineerA,
      idempotencyKey: 'test-accept-once',
    };
    const first = await request('/api/service/work-orders', {
      method: 'POST',
      actor: 'supervisor',
      json: payload,
    });
    expect(first.status).toBe(201);
    const created = (await readJson<{ data: WorkOrder }>(first)).data;
    // A new report waits for a supervisor; it is not accepted automatically.
    expect(created.status).toBe('pending_accept');
    expect(created.assigneeId).toBe(userIds.engineerA);

    // A repeated submission with the same idempotency key resolves to the same
    // work order instead of opening a second one.
    const second = await request('/api/service/work-orders', {
      method: 'POST',
      actor: 'supervisor',
      json: payload,
    });
    const repeated = (await readJson<{ data: WorkOrder }>(second)).data;
    expect(repeated.id).toBe(created.id);

    const matches = (await listOrders('supervisor')).filter(
      (order) =>
        order.title === (created as unknown as { title: string }).title,
    );
    expect(matches).toHaveLength(1);

    expect(
      await dispatchCount(`work-order:${String(created.id)}:accepted`),
    ).toBe(0);

    // The supervisor accepts it: the order moves to 待处理 and the assignee is
    // notified exactly once, even though the acceptance workflow also runs.
    expect((await transition('supervisor', created.id, 'accept')).status).toBe(
      200,
    );
    expect(
      await dispatchCount(`work-order:${String(created.id)}:accepted`),
    ).toBe(1);
    // A replayed acceptance is refused by the state machine instead of opening a
    // second notification or changing the state again.
    expect((await transition('supervisor', created.id, 'accept')).status).toBe(
      409,
    );
    expect(
      await dispatchCount(`work-order:${String(created.id)}:accepted`),
    ).toBe(1);

    // The next step belongs to the assignee; a read-only observer cannot take it.
    expect((await transition('observer', created.id, 'start')).status).toBe(
      403,
    );
    expect((await transition('engineerA', created.id, 'start')).status).toBe(
      200,
    );
    // Repeating a step that no longer applies is refused, not silently applied.
    expect((await transition('engineerA', created.id, 'start')).status).toBe(
      409,
    );
  });

  it('walks a work order from acceptance to closure and refuses a repeat', async () => {
    const order = await findOrder(
      'engineerA',
      (candidate) =>
        candidate.status === 'pending_process' &&
        candidate.assigneeId === userIds.engineerA,
    );
    expect((await transition('engineerA', order.id, 'submit')).status).toBe(
      409,
    );

    expect((await transition('engineerA', order.id, 'start')).status).toBe(200);
    // Submitting without a handling note is refused rather than closing the
    // order with an empty resolution.
    const emptySubmit = await transition('engineerA', order.id, 'submit', {
      resolution: '   ',
    });
    expect(emptySubmit.status).toBe(400);
    expect((await readJson<{ code?: string }>(emptySubmit)).code).toBe(
      'RESOLUTION_REQUIRED',
    );
    const submitted = await transition('engineerA', order.id, 'submit', {
      resolution: '更换密封件后试机正常。',
    });
    expect(submitted.status).toBe(200);
    expect((await readJson<{ data: WorkOrder }>(submitted)).data.status).toBe(
      'pending_confirm',
    );

    // The supervisor hears about the submission and returns it with a note.
    const returned = await transition('supervisor', order.id, 'return', {
      note: '缺少试机记录，请补充。',
    });
    expect(returned.status).toBe(200);
    expect((await readJson<{ data: WorkOrder }>(returned)).data.status).toBe(
      'pending_process',
    );
    expect(
      await dispatchCount(`work-order:${String(order.id)}:returned:%`),
    ).toBe(1);

    // The engineer cannot confirm their own work, and must resume before
    // submitting again.
    expect((await transition('engineerA', order.id, 'confirm')).status).toBe(
      403,
    );
    expect((await transition('engineerA', order.id, 'submit')).status).toBe(
      409,
    );
    expect((await transition('engineerA', order.id, 'start')).status).toBe(200);
    // A resubmission also needs a handling note before it can be confirmed.
    expect((await transition('engineerA', order.id, 'submit')).status).toBe(
      400,
    );
    expect(
      (
        await transition('engineerA', order.id, 'submit', {
          resolution: '补充试机记录，运行平稳。',
        })
      ).status,
    ).toBe(200);
    const closed = await transition('supervisor', order.id, 'confirm');
    expect(closed.status).toBe(200);
    const detail = await readJson<{ data: WorkOrder }>(
      await request(`/api/service/work-orders/${String(order.id)}`, {
        actor: 'supervisor',
      }),
    );
    expect(detail.data.status).toBe('closed');
    expect(detail.data.activities?.map((activity) => activity.action)).toEqual(
      expect.arrayContaining(['submit', 'return', 'confirm']),
    );

    // The closed order is final.
    expect((await transition('supervisor', order.id, 'return')).status).toBe(
      409,
    );

    // A closed order is read-only: neither an internal remark nor a new
    // attachment may be written after closure.
    const commentOnClosed = await request(
      `/api/service/work-orders/${String(order.id)}/comments`,
      {
        method: 'POST',
        actor: 'supervisor',
        json: { content: '关闭后不应再能写入。' },
      },
    );
    expect(commentOnClosed.status).toBe(409);
    const upload = new FormData();
    upload.append(
      'file',
      new File([new Uint8Array([137, 80, 78, 71])], 'closed.png', {
        type: 'image/png',
      }),
    );
    upload.append('category', 'photo');
    const attachmentOnClosed = await request(
      `/api/service/work-orders/${String(order.id)}/attachments`,
      { method: 'POST', actor: 'supervisor', form: upload },
    );
    expect(attachmentOnClosed.status).toBe(409);
  });

  it('never exposes a confidential order to an observer or another engineer', async () => {
    const confidential = await findOrder(
      'supervisor',
      (order) => order.confidential,
    );
    for (const actor of ['observer', 'engineerB'] as const) {
      const response = await request(
        `/api/service/work-orders/${String(confidential.id)}`,
        { actor },
      );
      expect(response.status).toBe(404);
    }
  });

  it('hides internal handling remarks from an observer', async () => {
    const order = await findOrder(
      'engineerA',
      (candidate) =>
        candidate.assigneeId === userIds.engineerA &&
        candidate.confidential === false,
    );
    const comment = await request(
      `/api/service/work-orders/${String(order.id)}/comments`,
      {
        method: 'POST',
        actor: 'engineerA',
        json: { content: '内部备注：泵体轻微渗漏，先观察一周期。' },
      },
    );
    expect(comment.status).toBe(200);

    // The handling staff keep the remark on the order's timeline.
    const asSupervisor = await readJson<{ data: WorkOrder }>(
      await request(`/api/service/work-orders/${String(order.id)}`, {
        actor: 'supervisor',
      }),
    );
    expect(
      asSupervisor.data.activities?.map((activity) => activity.action),
    ).toContain('commented');

    // The read-only observer sees the same order but not the internal remark.
    const asObserver = await readJson<{ data: WorkOrder }>(
      await request(`/api/service/work-orders/${String(order.id)}`, {
        actor: 'observer',
      }),
    );
    expect(asObserver.data.id).toBe(order.id);
    expect(
      asObserver.data.activities?.map((activity) => activity.action),
    ).not.toContain('commented');
  });

  it('shares one order with another engineer and refuses a confidential one', async () => {
    const order = await findOrder(
      'engineerA',
      (candidate) =>
        candidate.assigneeId === userIds.engineerA &&
        candidate.confidential === false,
    );
    const before = await request(
      `/api/service/work-orders/${String(order.id)}`,
      { actor: 'engineerB' },
    );
    expect(before.status).toBe(404);

    const shared = await request(
      `/api/service/work-orders/${String(order.id)}/share`,
      {
        method: 'POST',
        actor: 'engineerA',
        json: { engineerId: userIds.engineerB },
      },
    );
    expect(shared.status).toBe(200);
    const visible = await request(
      `/api/service/work-orders/${String(order.id)}`,
      { actor: 'engineerB' },
    );
    expect(visible.status).toBe(200);

    // The temporary share is read-only: the other engineer may read the order
    // but must not process it or write an internal remark.
    expect((await transition('engineerB', order.id, 'start')).status).toBe(403);
    const sharedComment = await request(
      `/api/service/work-orders/${String(order.id)}/comments`,
      {
        method: 'POST',
        actor: 'engineerB',
        json: { content: '共享工程师不应能写内部备注。' },
      },
    );
    expect(sharedComment.status).toBe(403);

    const confidential = await findOrder(
      'supervisor',
      (candidate) => candidate.confidential,
    );
    const refused = await request(
      `/api/service/work-orders/${String(confidential.id)}/share`,
      {
        method: 'POST',
        actor: 'supervisor',
        json: { engineerId: userIds.engineerB },
      },
    );
    expect(refused.status).toBe(409);

    const unshared = await request(
      `/api/service/work-orders/${String(order.id)}/share/${userIds.engineerB}`,
      { method: 'DELETE', actor: 'engineerA' },
    );
    expect(unshared.status).toBe(200);
    expect(
      (
        await request(`/api/service/work-orders/${String(order.id)}`, {
          actor: 'engineerB',
        })
      ).status,
    ).toBe(404);
  });

  it('accepts a PNG photo and protects the stored attachment', async () => {
    const order = await findOrder(
      'engineerA',
      (candidate) =>
        candidate.assigneeId === userIds.engineerA &&
        candidate.confidential === false,
    );
    const upload = new FormData();
    upload.append(
      'file',
      new File([new Uint8Array([137, 80, 78, 71])], '现场照片.png', {
        type: 'image/png',
      }),
    );
    upload.append('category', 'photo');
    const created = await request(
      `/api/service/work-orders/${String(order.id)}/attachments`,
      { method: 'POST', actor: 'engineerA', form: upload },
    );
    expect(created.status).toBe(201);
    const attachment = (await readJson<{ data: { id: string } }>(created)).data;

    // A non-PNG photo and a mislabelled report are refused, and the failure
    // leaves the request retryable — the file is not stored.
    const wrong = new FormData();
    wrong.append(
      'file',
      new File([new TextEncoder().encode('not an image')], 'notes.txt', {
        type: 'text/plain',
      }),
    );
    wrong.append('category', 'photo');
    expect(
      (
        await request(
          `/api/service/work-orders/${String(order.id)}/attachments`,
          { method: 'POST', actor: 'engineerA', form: wrong },
        )
      ).status,
    ).toBe(415);

    // A file that claims to be a PNG but carries no PNG signature is refused,
    // and so is a DOCX that is not a ZIP container; both are real failures, not
    // a silent store of an unusable file.
    const corruptedPhoto = new FormData();
    corruptedPhoto.append(
      'file',
      new File([new TextEncoder().encode('not really a photo')], 'broken.png', {
        type: 'image/png',
      }),
    );
    corruptedPhoto.append('category', 'photo');
    expect(
      (
        await request(
          `/api/service/work-orders/${String(order.id)}/attachments`,
          { method: 'POST', actor: 'engineerA', form: corruptedPhoto },
        )
      ).status,
    ).toBe(415);

    const corruptedReport = new FormData();
    corruptedReport.append(
      'file',
      new File(
        [new TextEncoder().encode('not a zip container')],
        'broken.docx',
        {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      ),
    );
    corruptedReport.append('category', 'report');
    expect(
      (
        await request(
          `/api/service/work-orders/${String(order.id)}/attachments`,
          { method: 'POST', actor: 'engineerA', form: corruptedReport },
        )
      ).status,
    ).toBe(415);

    const content = `/api/service/attachments/${attachment.id}/content`;
    expect((await request(content, { actor: 'engineerA' })).status).toBe(200);
    // A URL is not a permission: an anonymous caller and an engineer who
    // cannot read the order are both refused.
    expect((await request(content)).status).toBe(401);
    expect((await request(content, { actor: 'engineerB' })).status).toBe(404);

    // The order detail carries the stored file metadata the client previews
    // from, so PNG and DOCX render their real content.
    const detail = await readJson<{ data: WorkOrder }>(
      await request(`/api/service/work-orders/${String(order.id)}`, {
        actor: 'engineerA',
      }),
    );
    const stored = detail.data.attachments?.find(
      (row) => row.id === attachment.id,
    );
    expect(stored?.filename).toBe('现场照片.png');
    expect(stored?.mimeType).toBe('image/png');
  });

  it('accepts a device-platform report once and forbids dispatching', async () => {
    const eventId = `PLATFORM-${String(Date.now())}`;
    const report = {
      title: '设备平台上报：出口压力异常',
      deviceId: (
        await readJson<{ data: Array<{ id: number }> }>(
          await request('/api/service/devices', { actor: 'supervisor' }),
        )
      ).data[0]?.id,
      externalEventId: eventId,
      source: 'device_platform',
    };
    const first = await request('/api/service/device-platform/reports', {
      method: 'POST',
      actor: 'integration',
      json: report,
    });
    expect(first.status).toBe(201);
    const created = (await readJson<{ data: { id: number } }>(first)).data;

    const repeated = await request('/api/service/device-platform/reports', {
      method: 'POST',
      actor: 'integration',
      json: report,
    });
    expect((await readJson<{ data: { id: number } }>(repeated)).data.id).toBe(
      created.id,
    );

    const own = await listOrders('integration');
    expect(own.some((order) => order.id === created.id)).toBe(true);
    // The integration identity may not run the staff transitions.
    expect((await transition('integration', created.id, 'start')).status).toBe(
      403,
    );
    expect(
      (await transition('integration', created.id, 'confirm')).status,
    ).toBe(403);
  });

  it('runs the daily inspection schedule through the scheduler and records the run', async () => {
    const day = '2099-01-01';
    const list = await readJson<{
      data: Array<{ id: string; key: string; runCount: number }>;
    }>(await request('/api/schedules', { actor: 'supervisor' }));
    const schedule = list.data.find(
      (row) => row.key === 'service.daily-inspections',
    );
    expect(schedule).toBeDefined();
    const scheduleId = (schedule as { id: string }).id;
    const known = new Set(
      (await listScheduleOccurrences(scheduleId)).map(
        (occurrence) => occurrence.id,
      ),
    );

    const first = await request('/api/service/inspections/generate', {
      method: 'POST',
      actor: 'supervisor',
      json: { date: day },
    });
    expect(first.status).toBe(200);
    const run = (
      await readJson<{ data: { scheduleId: string; key: string } }>(first)
    ).data;
    // The trigger reaches the same materialized schedule the cron tick uses.
    expect(run.scheduleId).toBe(scheduleId);
    expect(run.key).toBe('service.daily-inspections');

    const occurrence = await waitForNewOccurrence(run.scheduleId, known);
    expect(occurrence.status).toBe('succeeded');
    expect(occurrence.resultSummary?.created ?? 0).toBeGreaterThan(0);

    // The Scheduler itself recorded the run, so its counter advanced.
    const after = await readJson<{
      data: Array<{ id: string; runCount: number }>;
    }>(await request('/api/schedules', { actor: 'supervisor' }));
    const updated = after.data.find((row) => row.id === scheduleId);
    expect(updated?.runCount ?? 0).toBeGreaterThan(
      (schedule as { runCount: number }).runCount,
    );

    // The same-device/same-day guard keeps a repeated run idempotent.
    const knownAgain = new Set(
      (await listScheduleOccurrences(scheduleId)).map(
        (occurrence) => occurrence.id,
      ),
    );
    const second = await request('/api/service/inspections/generate', {
      method: 'POST',
      actor: 'supervisor',
      json: { date: day },
    });
    expect(second.status).toBe(200);
    const secondOccurrence = await waitForNewOccurrence(scheduleId, knownAgain);
    expect(secondOccurrence.resultSummary?.created ?? -1).toBe(0);

    // An engineer may carry out an inspection but not decide the day's plan.
    expect(
      (
        await request('/api/service/inspections/generate', {
          method: 'POST',
          actor: 'engineerA',
          json: { date: day },
        })
      ).status,
    ).toBe(403);
  });

  it('refuses to run a stopped schedule until it is enabled again', async () => {
    const list = await readJson<{
      data: Array<{ id: string; key: string; enabled: boolean }>;
    }>(await request('/api/schedules', { actor: 'supervisor' }));
    const schedule = list.data.find(
      (row) => row.key === 'service.daily-inspections',
    );
    expect(schedule).toBeDefined();
    const scheduleId = (schedule as { id: string }).id;

    const stopped = await request(`/api/schedules/${scheduleId}/disable`, {
      method: 'POST',
      actor: 'supervisor',
    });
    expect(stopped.status).toBe(200);
    const blocked = await request('/api/service/inspections/generate', {
      method: 'POST',
      actor: 'supervisor',
      json: { date: '2099-01-02' },
    });
    expect(blocked.status).toBe(409);

    const resumed = await request(`/api/schedules/${scheduleId}/enable`, {
      method: 'POST',
      actor: 'supervisor',
    });
    expect(resumed.status).toBe(200);
  });

  it('runs the overdue reminder schedule through the scheduler once a day', async () => {
    const day = '2099-02-01';
    const list = await readJson<{
      data: Array<{ id: string; key: string }>;
    }>(await request('/api/schedules', { actor: 'supervisor' }));
    const schedule = list.data.find(
      (row) => row.key === 'service.overdue-reminders',
    );
    expect(schedule).toBeDefined();
    const scheduleId = (schedule as { id: string }).id;
    const known = new Set(
      (await listScheduleOccurrences(scheduleId)).map(
        (occurrence) => occurrence.id,
      ),
    );

    const first = await request(
      '/api/service/schedules/overdue-reminders/run',
      {
        method: 'POST',
        actor: 'supervisor',
        json: { date: day },
      },
    );
    expect(first.status).toBe(200);
    const firstOccurrence = await waitForNewOccurrence(scheduleId, known);
    expect(firstOccurrence.status).toBe('succeeded');
    const sent = firstOccurrence.resultSummary?.sent ?? 0;
    expect(sent).toBeGreaterThan(0);
    expect(await dispatchCount(`work-order:%:overdue:${day}`)).toBe(sent);

    const knownAgain = new Set(
      (await listScheduleOccurrences(scheduleId)).map(
        (occurrence) => occurrence.id,
      ),
    );
    const second = await request(
      '/api/service/schedules/overdue-reminders/run',
      {
        method: 'POST',
        actor: 'supervisor',
        json: { date: day },
      },
    );
    expect(second.status).toBe(200);
    const secondOccurrence = await waitForNewOccurrence(scheduleId, knownAgain);
    expect(secondOccurrence.resultSummary?.sent ?? -1).toBe(sent);
    expect(await dispatchCount(`work-order:%:overdue:${day}`)).toBe(sent);
  });

  it('answers from published material and only writes after confirmation', async () => {
    const before = (await listOrders('supervisor')).length;
    const answer = await readJson<{
      data: {
        status: string;
        answer: string;
        references: Array<{ type: string; title: string }>;
        proposedAction?: { type: string };
      };
    }>(
      await request('/api/service/assistant/query', {
        method: 'POST',
        actor: 'engineerA',
        json: {
          question: '出口压力偏低时应该怎么排查？请帮我创建一张维修工单。',
        },
      }),
    );
    // No model is configured in the test application, so the assistant reports
    // that real state instead of presenting a template as a generated answer.
    expect(answer.data.status).toBe('model_unavailable');
    expect(answer.data.references.length).toBeGreaterThan(0);
    expect(answer.data.references.some((ref) => ref.type !== 'order')).toBe(
      true,
    );
    expect(answer.data.proposedAction?.type).toBe('create_work_order');
    // Proposing is not writing: the work order count is unchanged.
    expect((await listOrders('supervisor')).length).toBe(before);

    const confirmed = await request('/api/service/assistant/confirm', {
      method: 'POST',
      actor: 'engineerA',
      json: {
        title: '助手确认创建的工单',
        description: '用户点击确认后创建。',
        deviceId: (
          await readJson<{ data: Array<{ id: number }> }>(
            await request('/api/service/devices', { actor: 'supervisor' }),
          )
        ).data[0]?.id,
        idempotencyKey: 'test-assistant-confirm',
      },
    });
    expect(confirmed.status).toBe(201);
    expect((await listOrders('supervisor')).length).toBe(before + 1);
  });

  it('states insufficient evidence instead of citing unrelated material', async () => {
    const answer = await readJson<{
      data: { status: string; references: unknown[] };
    }>(
      await request('/api/service/assistant/query', {
        method: 'POST',
        actor: 'engineerA',
        json: { question: '如何更换汽车轮胎？' },
      }),
    );
    expect(answer.data.status).toBe('insufficient_evidence');
    expect(answer.data.references.length).toBe(0);
  });

  it('answers from the newest manual version and keeps authoring supervisor-only', async () => {
    const listed = await readJson<{
      data: Array<{ id: number; title: string; version: string }>;
    }>(await request('/api/service/manuals', { actor: 'engineerA' }));
    expect(listed.data.length).toBeGreaterThan(0);
    const seeded = listed.data[0];
    expect(seeded).toBeDefined();

    // An engineer reads a manual but cannot author or delete one.
    expect(
      (
        await request('/api/service/manuals', {
          method: 'POST',
          actor: 'engineerA',
          json: {
            title: seeded.title,
            version: 'v99.0',
            content: '工程师不该能写入手册。',
            status: 'published',
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`/api/service/manuals/${seeded.id}`, {
          method: 'DELETE',
          actor: 'engineerA',
        })
      ).status,
    ).toBe(403);

    // The supervisor publishes a new version under the same title.
    const created = await request('/api/service/manuals', {
      method: 'POST',
      actor: 'supervisor',
      json: {
        title: seeded.title,
        version: 'v99.0',
        deviceModel: 'NX-200',
        content: '这是最新版本的处理办法。',
        status: 'published',
      },
    });
    expect(created.status).toBe(201);

    // A conversation started now answers from the revision, not the row it replaced.
    const answer = await readJson<{
      data: {
        references: Array<{ type: string; title: string; detail?: string }>;
      };
    }>(
      await request('/api/service/assistant/query', {
        method: 'POST',
        actor: 'engineerA',
        json: { question: seeded.title },
      }),
    );
    const manualRefs = answer.data.references.filter(
      (ref) => ref.type === 'manual',
    );
    expect(manualRefs[0]?.title).toContain('(v99.0)');
    expect(
      manualRefs.some((ref) => ref.title.includes(`(${seeded.version})`)),
    ).toBe(false);
  });
});
