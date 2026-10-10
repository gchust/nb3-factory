// @vitest-environment node
//
// The after-sales service feature, exercised through the running application.
//
// Nothing here stubs a service: the file starts the same standalone server
// `pnpm start` starts, on databases of its own, with the application's own
// migrations and seeds installed. A test therefore proves the boundary a user
// meets — the session middleware, the permission check, the data scope — rather
// than a handler called directly.

import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';

import { symlink } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, vi } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.js';

/** The shared initial password of the demo accounts the fixture seed creates. */
const DEMO_PASSWORD = 'Service@123';

const OBSERVER = { email: 'observer@example.com', password: DEMO_PASSWORD };
const SUPERVISOR = {
  email: 'service.supervisor@example.com',
  password: DEMO_PASSWORD,
};
const ENGINEER_TWO = {
  email: 'engineer.two@example.com',
  password: DEMO_PASSWORD,
};
const INTEGRATOR = {
  email: 'platform.api@example.com',
  password: DEMO_PASSWORD,
};

// The application's own `config.yml` is not read by the test harness — the
// harness writes its own configuration file — so the secrets a deployment keeps
// there are supplied here. They are never the demo accounts' password: a test
// secret signs sessions, it does not sign anyone in.
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    // A configured base URL is what makes a cookie-authenticated write's
    // `Origin` trusted, so a browser-style write passes the CSRF check.
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'service-app-test-auth-secret' },
    session: { secret: 'service-app-test-session-secret' },
  },
});

/**
 * Signs in and returns a session whose writes carry the browser's `Origin`.
 *
 * The application protects a cookie-authenticated write against CSRF by
 * checking the request origin, exactly as a browser sends it; a raw in-process
 * `fetch` does not. A test that writes sends the origin the harness addresses
 * the application on.
 */
async function signInWithOrigin(
  app: Parameters<typeof signIn>[0],
  credentials: { readonly email: string; readonly password: string },
): Promise<TestSession> {
  const session = await signIn(app, credentials);
  return {
    ...session,
    fetch: (path, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set('origin', 'http://localhost');
      return session.fetch(path, { ...init, headers });
    },
  };
}

/**
 * Uploads one multipart attachment through the session's origin-aware fetch.
 *
 * The upload is the only request whose body is not JSON, so it carries a `File`
 * part named `file`, which is what the route reads.
 */
function uploadAttachment(
  session: TestSession,
  orderId: number,
  filename: string,
  type: string,
  bytes: Uint8Array,
): Promise<Response> {
  const form = new FormData();
  form.append('file', new File([bytes], filename, { type }));
  return Promise.resolve(
    session.fetch(`/serviceOrders/${orderId}/attachments`, {
      method: 'POST',
      body: form,
    }),
  );
}

/** Resolves the numeric id of a seeded order by its business number. */
async function seededOrderId(
  database: DatabaseManager,
  orderNo: string,
): Promise<number> {
  const order = await database
    .repository<{ id: number; orderNo: string }>('service_orders')
    .findOne({ filter: { orderNo } });
  if (!order) {
    throw new Error(`The fixture seed did not create ${orderNo}.`);
  }
  return Number(order.id);
}

// Starting an application installs every migration and seed, so the file's own
// tests need longer than Vitest's default budget.
vi.setConfig({ testTimeout: 240_000 });

interface OrderList {
  readonly data: readonly { readonly id: number; readonly orderNo: string }[];
  readonly meta: { readonly total: number };
}

type Envelope<T> = { readonly data: T };

test('declares every route in its API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);

  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  // A representative route per concern, with the statuses it can actually
  // return: 400 from its validators, 401/403/500 from `apiErrorResponses`, and
  // its own precondition 404.
  const create = document.paths?.['/api/serviceOrders']?.post;
  expect(create?.operationId).toBe('createServiceOrder');
  expect(Object.keys(create?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '403',
    '404',
    '500',
  ]);

  // A machine interface reached with an API key rather than a session, so it
  // declares no security requirement of its own.
  const event = document.paths?.['/api/integration/deviceEvents']?.post;
  expect(event?.operationId).toBe('submitDeviceEvent');
  expect(event?.security).toEqual([]);

  for (const operationId of [
    'listServiceOrders',
    'acceptServiceOrder',
    'assignServiceOrder',
    'grantServiceOrderShare',
    'createServiceInspection',
    'completeServiceInspection',
    'createRepairKnowledge',
    'reindexDeviceManual',
    'getServiceAssistantStatus',
  ]) {
    const declared = Object.values(document.paths ?? {}).some((path) =>
      Object.values(path).some(
        (operation) =>
          typeof operation === 'object' &&
          operation !== null &&
          (operation as { operationId?: string }).operationId === operationId,
      ),
    );
    if (!declared) {
      throw new Error(`${operationId} is not declared in the API document`);
    }
  }
});

test('refuses an anonymous request to every business prefix', async ({
  request,
}) => {
  for (const path of [
    '/serviceOrders',
    '/customers',
    '/devices',
    '/repairKnowledge',
  ]) {
    const response = await request(path);
    expect(response.status).toBe(401);
  }
  // The platform interface is called without a browser session and must reject
  // an anonymous delivery too; it authenticates with an API key.
  expect(
    (
      await request('/integration/deviceEvents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          externalEventId: 'x',
          deviceCode: 'DEV-1001',
          title: 'x',
        }),
      })
    ).status,
  ).toBe(401);
});

test('scopes the read-only observer to the released orders only', async ({
  testApp,
}) => {
  const observer = await signInWithOrigin(testApp, OBSERVER);

  const list = await observer.fetch('/serviceOrders');
  expect(list.status).toBe(200);
  const body = (await list.json()) as OrderList;
  // Exactly one seeded order is released to observers and not confidential.
  expect(body.data.map((order) => order.orderNo)).toEqual(['SO-2026-1005']);

  // Reading an unreleased order by id is a 404, not a 403: the row is not in
  // the observer's scope, and the endpoint does not confirm what exists.
  expect((await observer.fetch('/serviceOrders/1')).status).toBe(404);

  // The observer holds no processing permission, so the transitions refuse it.
  expect(
    (
      await observer.fetch('/serviceOrders/1/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).status,
  ).toBe(403);

  // Creating anything is outside the role.
  expect(
    (
      await observer.fetch('/serviceOrders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'nope', deviceId: 1 }),
      })
    ).status,
  ).toBe(403);

  // Knowledge is readable, but only the published entries.
  const knowledge = await observer.fetch('/repairKnowledge');
  expect(knowledge.status).toBe(200);
  const entries = (await knowledge.json()) as {
    data: readonly { status: string }[];
  };
  expect(entries.data.length).toBeGreaterThan(0);
  expect(entries.data.every((entry) => entry.status === 'published')).toBe(
    true,
  );

  // The assistant page's own status endpoint is readable but reports state; it
  // grants no business action.
  const assistant = await observer.fetch('/serviceAssistant/status');
  expect(assistant.status).toBe(200);

  // The user directory is granted to jobs that assign work, not to the
  // observer, and the endpoint says so.
  expect((await observer.fetch('/users')).status).toBe(403);
});

test('lets a supervisor manage the catalog and keeps the drafts away from engineers', async ({
  testApp,
}) => {
  const supervisor = await signInWithOrigin(testApp, SUPERVISOR);
  const engineer = await signInWithOrigin(testApp, ENGINEER_TWO);

  const created = await supervisor.fetch('/customers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '测试客户 API', contactName: '王工' }),
  });
  expect(created.status).toBe(200);
  const customer = (await created.json()) as Envelope<{
    id: number;
    name: string;
  }>;
  expect(customer.data.name).toBe('测试客户 API');

  // Only the supervisor maintains knowledge; a draft stays invisible to the
  // engineer's read policy even though it exists.
  const draft = await supervisor.fetch('/repairKnowledge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: '草稿条目 API',
      content: '仅主管可见。',
      status: 'draft',
    }),
  });
  expect(draft.status).toBe(200);
  const entry = (await draft.json()) as Envelope<{
    id: number;
    status: string;
  }>;
  expect(entry.data.status).toBe('draft');

  expect(
    (await engineer.fetch(`/repairKnowledge/${entry.data.id}`)).status,
  ).toBe(404);

  // The engineer cannot author knowledge either.
  expect(
    (
      await engineer.fetch('/repairKnowledge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '不应允许', content: 'x' }),
      })
    ).status,
  ).toBe(403);

  // Publishing turns the same row visible without a second grant.
  const published = await supervisor.fetch(
    `/repairKnowledge/${entry.data.id}/publish`,
    {
      method: 'POST',
    },
  );
  expect(published.status).toBe(200);
  expect(
    (await engineer.fetch(`/repairKnowledge/${entry.data.id}`)).status,
  ).toBe(200);
});

test('creates an order once, accepts it through the workflow, and logs the transition', async ({
  testApp,
}) => {
  const supervisor = await signInWithOrigin(testApp, SUPERVISOR);

  const body = {
    title: 'API 自动化验收测试工单',
    deviceId: 1,
    orderNo: 'SO-API-TEST-1',
    priority: 'high',
  };

  const first = await supervisor.fetch('/serviceOrders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(first.status).toBe(200);
  const created = (await first.json()) as Envelope<{
    order: { id: number; status: string; orderNo: string };
    created: boolean;
  }>;
  expect(created.data.created).toBe(true);
  expect(created.data.order.orderNo).toBe('SO-API-TEST-1');
  // A non-confidential order is accepted automatically while the request runs.
  expect(created.data.order.status).toBe('pending_processing');

  // A second delivery of the same request is the same order, not a new one.
  const second = await supervisor.fetch('/serviceOrders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(second.status).toBe(200);
  const repeated = (await second.json()) as Envelope<{
    order: { id: number };
    created: boolean;
  }>;
  expect(repeated.data.created).toBe(false);
  expect(repeated.data.order.id).toBe(created.data.order.id);

  // The acceptance wrote its own log entry, keyed by the order so a replayed
  // run cannot write a second one.
  const timeline = await supervisor.fetch(
    `/serviceOrders/${created.data.order.id}/timeline`,
  );
  expect(timeline.status).toBe(200);
  const events = (await timeline.json()) as Envelope<{
    logs: readonly { action: string; idempotencyKey?: string | null }[];
  }>;
  const acceptances = events.data.logs.filter(
    (log) => log.action === 'accept_auto',
  );
  expect(acceptances).toHaveLength(1);
});

test('keeps an automatic acceptance away from a confidential order', async ({
  testApp,
}) => {
  const supervisor = await signInWithOrigin(testApp, SUPERVISOR);

  const created = await supervisor.fetch('/serviceOrders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'API 保密工单测试',
      deviceId: 2,
      orderNo: 'SO-API-TEST-2',
      confidential: true,
    }),
  });
  expect(created.status).toBe(200);
  const body = (await created.json()) as Envelope<{
    order: { id: number; status: string };
  }>;
  expect(body.data.order.status).toBe('pending_acceptance');

  // A supervisor accepts it explicitly, which the automatic path refuses.
  const accepted = await supervisor.fetch(
    `/serviceOrders/${body.data.order.id}/accept`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acceptanceNote: '主管确认受理保密工单。' }),
    },
  );
  expect(accepted.status).toBe(200);
  const result = (await accepted.json()) as Envelope<{
    order: { status: string };
  }>;
  expect(result.data.order.status).toBe('pending_processing');
});

test('records the priority branch and notifies the assignee on acceptance', async ({
  testApp,
}) => {
  const database = testApp.application.container.resolve(databaseManagerToken);
  const supervisor = await signInWithOrigin(testApp, SUPERVISOR);

  const created = await supervisor.fetch('/serviceOrders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'API 紧急工单分支测试',
      deviceId: 1,
      orderNo: 'SO-API-URGENT-1',
      priority: 'urgent',
      dueAt: '2026-11-15T09:00:00.000Z',
    }),
  });
  expect(created.status).toBe(200);
  const body = (await created.json()) as Envelope<{
    order: {
      id: number;
      status: string;
      priority: string;
      acceptanceNote: string | null;
    };
  }>;
  // A non-confidential order is accepted while the request runs, and the urgent
  // branch produces its own acceptance note rather than the normal one.
  expect(body.data.order.status).toBe('pending_processing');
  expect(body.data.order.priority).toBe('urgent');
  expect(body.data.order.acceptanceNote).toContain('Urgent');

  // The audit trail records which branch ran and what it said, so the steps and
  // the result of this transition are readable afterwards.
  const timeline = await supervisor.fetch(
    `/serviceOrders/${body.data.order.id}/timeline`,
  );
  expect(timeline.status).toBe(200);
  const events = (await timeline.json()) as Envelope<{
    logs: readonly { action: string; detail: unknown }[];
  }>;
  const accepted = events.data.logs.filter(
    (log) => log.action === 'accept_auto',
  );
  expect(accepted).toHaveLength(1);
  const detail = accepted[0].detail as {
    branch?: string;
    acceptanceNote?: string;
  } | null;
  expect(detail?.branch).toBe('urgent');
  expect(detail?.acceptanceNote).toContain('Urgent');

  // The acceptance notice is persisted in the assignee's in-app inbox, keyed to
  // the order so a repeated acceptance cannot deliver it twice.
  const inbox = await database.repository('notificationInAppItems').findMany();
  const delivered = inbox.filter((item) =>
    JSON.stringify(item).includes('SO-API-URGENT-1'),
  );
  expect(delivered.length).toBeGreaterThan(0);
});

test('returns a submitted order with a reason and notifies its engineer', async ({
  testApp,
}) => {
  const database = testApp.application.container.resolve(databaseManagerToken);
  const supervisor = await signInWithOrigin(testApp, SUPERVISOR);
  const engineer = await signInWithOrigin(testApp, ENGINEER_TWO);

  // Seeded order SO-2026-1004 waits for confirmation and is assigned to the
  // engineer, which is exactly the state the return path needs.
  const orderId = await seededOrderId(database, 'SO-2026-1004');
  const reason = '现场复测仍不达标，退回重新校准并补充测量记录。';

  const before = await supervisor.fetch(`/serviceOrders/${orderId}`);
  expect(before.status).toBe(200);
  const beforeBody = (await before.json()) as Envelope<{
    status: string;
  }>;
  expect(beforeBody.data.status).toBe('pending_confirmation');

  // The supervisor returns it with a reason. Before the fix the confirm action
  // forbade `returnReason`, so this was a 403 and the order could not go back.
  const returned = await supervisor.fetch(`/serviceOrders/${orderId}/return`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnReason: reason }),
  });
  expect(returned.status).toBe(200);
  const result = (await returned.json()) as Envelope<{
    status: string;
    returnReason: string | null;
  }>;
  expect(result.data.status).toBe('pending_processing');
  expect(result.data.returnReason).toBe(reason);

  // The return is audited and the engineer is told why the work came back.
  const timeline = await supervisor.fetch(`/serviceOrders/${orderId}/timeline`);
  expect(timeline.status).toBe(200);
  const events = (await timeline.json()) as Envelope<{
    logs: readonly { action: string }[];
  }>;
  expect(
    events.data.logs.filter((log) => log.action === 'return'),
  ).toHaveLength(1);

  const inbox = await database.repository('notificationInAppItems').findMany();
  expect(
    inbox.filter((item) => JSON.stringify(item).includes(reason)).length,
  ).toBeGreaterThan(0);

  // The engineer keeps the returned order in their own scope and can read it.
  expect((await engineer.fetch(`/serviceOrders/${orderId}`)).status).toBe(200);
});

test('grants an engineer read access to a shared order without processing rights', async ({
  testApp,
}) => {
  const database = testApp.application.container.resolve(databaseManagerToken);
  const supervisor = await signInWithOrigin(testApp, SUPERVISOR);
  const engineer = await signInWithOrigin(testApp, ENGINEER_TWO);

  const row = await database
    .query()
    .selectFrom('user')
    .select('id')
    .where('email', '=', ENGINEER_TWO.email)
    .executeTakeFirst();
  const engineerId = String(row?.id ?? '');
  expect(engineerId).not.toBe('');

  // A seeded order of engineer one, neither assigned to nor shared with
  // engineer two: out of scope until it is shared.
  const orderId = await seededOrderId(database, 'SO-2026-1002');
  expect((await engineer.fetch(`/serviceOrders/${orderId}`)).status).toBe(404);

  const shared = await supervisor.fetch(`/serviceOrders/${orderId}/shares`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ engineerId, note: '临时协助排查光路。' }),
  });
  expect(shared.status).toBe(200);
  const shareBody = (await shared.json()) as Envelope<{
    id: number;
    engineerId: string;
  }>;
  expect(shareBody.data.engineerId).toBe(engineerId);

  // The share now grants reading, which is the point of the temporary
  // collaboration: detail and list include the order.
  const detail = await engineer.fetch(`/serviceOrders/${orderId}`);
  expect(detail.status).toBe(200);
  const detailBody = (await detail.json()) as Envelope<{ orderNo: string }>;
  expect(detailBody.data.orderNo).toBe('SO-2026-1002');

  const list = await engineer.fetch('/serviceOrders');
  expect(list.status).toBe(200);
  const listBody = (await list.json()) as OrderList;
  expect(listBody.data.some((order) => order.id === orderId)).toBe(true);

  // Reading is all it grants: the shared order is not in the engineer's
  // processing scope, so a transition cannot touch it.
  const started = await engineer.fetch(`/serviceOrders/${orderId}/start`, {
    method: 'POST',
  });
  expect(started.status).toBe(404);

  // Revoking the share closes the extra read access on the next check.
  const revoked = await supervisor.fetch(
    `/serviceOrders/${orderId}/shares/${shareBody.data.id}`,
    { method: 'DELETE' },
  );
  expect(revoked.status).toBe(200);
  expect((await engineer.fetch(`/serviceOrders/${orderId}`)).status).toBe(404);

  // A confidential order cannot be opened to a non-owner this way: the share
  // is refused and the engineer stays out of scope.
  const confidentialId = await seededOrderId(database, 'SO-2026-1006');
  expect(
    (await engineer.fetch(`/serviceOrders/${confidentialId}`)).status,
  ).toBe(404);
  const forbidden = await supervisor.fetch(
    `/serviceOrders/${confidentialId}/shares`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ engineerId, note: '不应被允许。' }),
    },
  );
  expect(forbidden.status).toBe(400);
  const forbiddenBody = (await forbidden.json()) as {
    error: { reason: string };
  };
  expect(forbiddenBody.error.reason).toBe('CONFIDENTIAL_ORDER_SHARE_FORBIDDEN');
  expect(
    (await engineer.fetch(`/serviceOrders/${confidentialId}`)).status,
  ).toBe(404);
});

test('stores a valid PNG and DOCX and refuses a corrupt or unsupported file', async ({
  testApp,
}) => {
  const supervisor = await signInWithOrigin(testApp, SUPERVISOR);
  const orderId = 1;

  // A real 1x1 PNG, so the stored bytes are verifiably the uploaded ones.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const uploaded = await uploadAttachment(
    supervisor,
    orderId,
    '检查照片.png',
    'image/png',
    new Uint8Array(png),
  );
  expect(uploaded.status).toBe(200);
  const file = (await uploaded.json()) as Envelope<{
    id: string;
    mimeType: string;
    category: string;
    size: number;
  }>;
  // The primary key the upload generates is what the missing default used to
  // make the insert fail with a 500.
  expect(file.data.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  expect(file.data.mimeType).toBe('image/png');
  expect(file.data.category).toBe('photo');
  // The stored size is a bigint-backed column, which SQLite returns as text.
  expect(Number(file.data.size)).toBe(png.byteLength);

  // The stored bytes come back through the authorized download.
  const content = await supervisor.fetch(
    `/serviceOrders/${orderId}/attachments/${file.data.id}/content`,
  );
  expect(content.status).toBe(200);
  expect(new Uint8Array(await content.arrayBuffer())).toEqual(
    new Uint8Array(png),
  );

  const report = await uploadAttachment(
    supervisor,
    orderId,
    '维修报告.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // A DOCX is a ZIP; the local file header is its leading signature.
    new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]),
  );
  expect(report.status).toBe(200);

  // A `.png` whose content is not a PNG is refused with a real reason, not the
  // opaque 500 the missing key produced.
  const corrupt = await uploadAttachment(
    supervisor,
    orderId,
    'corrupt.png',
    'image/png',
    new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
  );
  expect(corrupt.status).toBe(400);
  const corruptBody = (await corrupt.json()) as { error: { reason: string } };
  expect(corruptBody.error.reason).toBe('ATTACHMENT_CORRUPTED');

  const unsupported = await uploadAttachment(
    supervisor,
    orderId,
    'payload.exe',
    'application/octet-stream',
    new Uint8Array([0x4d, 0x5a, 0x00, 0x00]),
  );
  expect(unsupported.status).toBe(400);
  const unsupportedBody = (await unsupported.json()) as {
    error: { reason: string };
  };
  expect(unsupportedBody.error.reason).toBe('ATTACHMENT_TYPE_UNSUPPORTED');
});

test('de-duplicates a re-delivered platform event on its external id', async ({
  testApp,
}) => {
  const integrator = await signInWithOrigin(testApp, INTEGRATOR);

  const payload = {
    externalEventId: 'PLATFORM-EVENT-API-1',
    deviceCode: 'DEV-1002',
    title: '平台告警：冷却液温度过高',
    priority: 'high',
  };

  const first = await integrator.fetch('/integration/deviceEvents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  expect(first.status).toBe(200);
  const delivered = (await first.json()) as Envelope<{
    order: { id: number; orderNo: string; source: string };
    created: boolean;
    externalEventId: string;
  }>;
  expect(delivered.data.created).toBe(true);
  expect(delivered.data.order.source).toBe('platform');

  const repeat = await integrator.fetch('/integration/deviceEvents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  expect(repeat.status).toBe(200);
  const replayed = (await repeat.json()) as Envelope<{
    order: { id: number };
    created: boolean;
  }>;
  expect(replayed.data.created).toBe(false);
  expect(replayed.data.order.id).toBe(delivered.data.order.id);

  // The lookup by external id answers with the same order.
  const lookup = await integrator.fetch(
    `/integration/events/PLATFORM-EVENT-API-1`,
  );
  expect(lookup.status).toBe(200);
  const found = (await lookup.json()) as Envelope<{ order: { id: number } }>;
  expect(found.data.order.id).toBe(delivered.data.order.id);

  // An unknown device is a 404, not a silent success.
  const unknown = await integrator.fetch('/integration/deviceEvents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      externalEventId: 'PLATFORM-EVENT-API-2',
      deviceCode: 'NOPE',
    }),
  });
  expect(unknown.status).toBe(404);
});

test('completes an inspection and schedules the next one', async ({
  testApp,
}) => {
  const engineer = await signInWithOrigin(testApp, ENGINEER_TWO);

  const created = await engineer.fetch('/serviceInspections', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deviceId: 3,
      plannedDate: '2026-11-01T02:00:00.000Z',
    }),
  });
  expect(created.status).toBe(200);
  const inspection = (await created.json()) as Envelope<{
    id: number;
    status: string;
  }>;
  expect(inspection.data.status).toBe('pending');

  const completed = await engineer.fetch(
    `/serviceInspections/${inspection.data.id}/complete`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        result: 'attention',
        resultCode: 'API-CHECK-01',
        nextDate: '2026-12-01T02:00:00.000Z',
      }),
    },
  );
  expect(completed.status).toBe(200);
  const result = (await completed.json()) as Envelope<{
    id: number;
    status: string;
    result: string | null;
    resultCode: string;
  }>;
  expect(result.data.status).toBe('completed');
  expect(result.data.resultCode).toBe('API-CHECK-01');

  // The follow-up visit is written to the device ledger, not merely echoed.
  const device = await engineer.fetch('/devices/3');
  expect(device.status).toBe(200);
  const ledger = (await device.json()) as Envelope<{
    nextInspectionDate: string | null;
  }>;
  expect(ledger.data.nextInspectionDate).toContain('2026-12-01');
});

test('reports the dashboard from the caller’s own scope', async ({
  testApp,
}) => {
  const observer = await signInWithOrigin(testApp, OBSERVER);
  const supervisor = await signInWithOrigin(testApp, SUPERVISOR);

  const observed = await observer.fetch('/serviceDashboard/summary');
  expect(observed.status).toBe(200);
  const observerSummary = (await observed.json()) as Envelope<{
    openOrders: number;
    byStatus: Record<string, number>;
    groupCounts: readonly { code: string }[];
  }>;
  // The observer sees one released order, which the seed left closed, so the
  // dashboard counts nothing open and no status holds a row.
  expect(observerSummary.data.openOrders).toBe(0);
  expect(
    Object.values(observerSummary.data.byStatus).every((count) => count === 0),
  ).toBe(true);
  // Team-wide load is not part of a row-scoped observer's report.
  expect(observerSummary.data.groupCounts).toEqual([]);

  const full = await supervisor.fetch('/serviceDashboard/summary');
  expect(full.status).toBe(200);
  const supervisorSummary = (await full.json()) as Envelope<{
    openOrders: number;
    byStatus: Record<string, number>;
    groupCounts: readonly { groupId: number; code: string; name: string }[];
  }>;
  expect(supervisorSummary.data.openOrders).toBeGreaterThan(
    observerSummary.data.openOrders,
  );
  expect(Object.keys(supervisorSummary.data.byStatus).length).toBeGreaterThan(
    0,
  );
  // A supervisor sees the open work of every engineer group, which is what the
  // dashboard's group load card renders.
  expect(
    supervisorSummary.data.groupCounts.map((group) => group.code).sort(),
  ).toEqual(['group-a', 'group-b']);
});

test('registers the scheduled scans and runs the acceptance workflow', async ({
  testApp,
}) => {
  const database = testApp.application.container.resolve(databaseManagerToken);

  // The scheduled scans the application owns, registered when the scheduler
  // provider boots. Their presence is what makes inspections and overdue
  // reminders run without a user pressing anything.
  const schedules = await database.repository('scheduleDefinitions').findMany();
  expect(
    schedules
      .map((schedule) => String(schedule.key))
      .filter((key) => key.startsWith('app.'))
      .sort(),
  ).toEqual([
    'app.daily-inspection-scan',
    'app.inspection-scan-test',
    'app.manual-index-scan',
    'app.overdue-reminder-scan',
    'app.overdue-reminder-test',
  ]);

  // The acceptance lifecycle is a real source workflow. Enabling a discovered
  // source is the supported management operation an administrator performs
  // once; the route then triggers the workflow instead of the shared direct
  // transition.
  //
  // A materialized run script is read from the application's own storage and
  // resolves its external imports from there. The test application stands in a
  // temporary directory without a `node_modules` of its own, so link the
  // workspace's tree where a deployment's application root would hold it.
  await symlink(
    join(process.cwd(), 'node_modules'),
    join(testApp.config.directory, 'node_modules'),
    'dir',
  ).catch(() => undefined);

  const admin = await signInWithOrigin(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const sourceResponse = await admin.fetch(
    '/workflows/sources/order-acceptance',
  );
  expect(sourceResponse.status).toBe(200);
  const source = (await sourceResponse.json()) as Envelope<{ hash: string }>;
  const enabled = await admin.fetch(`/workflows/${source.data.hash}/enable`, {
    method: 'POST',
  });
  expect(enabled.status).toBe(200);
  const enabledBody = (await enabled.json()) as Envelope<{ enabled: boolean }>;
  expect(enabledBody.data.enabled).toBe(true);

  // With the workflow enabled, a manual acceptance reports that the workflow
  // ran rather than the direct fallback.
  const supervisor = await signInWithOrigin(testApp, SUPERVISOR);
  const accepted = await supervisor.fetch('/serviceOrders/1/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ acceptanceNote: 'workflow check' }),
  });
  expect(accepted.status).toBe(200);
  const result = (await accepted.json()) as Envelope<{
    viaWorkflow: boolean;
    order: { status: string };
  }>;
  expect(result.data.viaWorkflow).toBe(true);
  expect(result.data.order.status).toBe('pending_processing');

  // The workflow's own notification node delivered the acceptance notice. The
  // direct fallback skips it once the transition already ran, so the presence of
  // the message proves the workflow path, not the fallback, did the work.
  const inbox = await database.repository('notificationInAppItems').findMany();
  expect(
    inbox.filter((item) => JSON.stringify(item).includes('workflow check'))
      .length,
  ).toBeGreaterThan(0);
});

test('issues and revokes the integration account API keys from the supervisor surface', async ({
  testApp,
}) => {
  const supervisor = await signInWithOrigin(testApp, SUPERVISOR);
  const engineer = await signInWithOrigin(testApp, ENGINEER_TWO);
  const integrator = await signInWithOrigin(testApp, INTEGRATOR);

  const created = await supervisor.fetch('/integration/keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'API 集成密钥测试', expiresInDays: 30 }),
  });
  expect(created.status).toBe(200);
  const issued = (await created.json()) as Envelope<{
    key: { id: string; name: string; enabled: boolean };
    secret: string;
  }>;
  expect(issued.data.secret.length).toBeGreaterThan(0);

  // The key is listed for the machine account, and the secret is never read
  // back — it exists only in the answer to the issuing request.
  const list = await supervisor.fetch('/integration/keys');
  expect(list.status).toBe(200);
  const keys = (await list.json()) as Envelope<
    readonly { id: string; name: string; enabled: boolean }[]
  >;
  expect(keys.data.find((key) => key.id === issued.data.key.id)?.name).toBe(
    'API 集成密钥测试',
  );
  expect(JSON.stringify(keys.data)).not.toContain(issued.data.secret);

  // A machine credential is issued by the supervisor capability, not by an
  // engineer and not by the machine account itself.
  for (const session of [engineer, integrator]) {
    expect((await session.fetch('/integration/keys')).status).toBe(403);
    expect(
      (
        await session.fetch('/integration/keys', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'nope' }),
        })
      ).status,
    ).toBe(403);
  }

  const revoked = await supervisor.fetch(
    `/integration/keys/${issued.data.key.id}`,
    { method: 'DELETE' },
  );
  expect(revoked.status).toBe(200);
  const after = await supervisor.fetch('/integration/keys');
  const remaining = (await after.json()) as Envelope<readonly { id: string }[]>;
  expect(remaining.data.some((key) => key.id === issued.data.key.id)).toBe(
    false,
  );
});
