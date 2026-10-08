// @vitest-environment node
import { register } from 'tsx/esm/api';
import { createAppTest } from '@nocobase/app-testing/server';
import { describe, expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

// An installing run loads the application's own migrations and seeds from
// source. A seed is allowed to import from `server/*.js`, which names a `.ts`
// file in a source checkout, so this process needs the same TypeScript loader
// `pnpm dev` and `pnpm nocobase` register before the application boots.
register();

/**
 * Business behaviour of the equipment after-sales service application, run
 * against a real installation: the same runtime, plugins, migrations and seeds
 * `pnpm start` uses, on a test database of its own.
 */
const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  install: true,
  scope: 'file',
  config: {
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    // The in-process requests are addressed as `http://localhost`; naming the
    // public origin makes it the trusted origin for cookie-authenticated
    // writes, exactly as `APP_PUBLIC_ORIGIN` does in a deployment.
    app: { publicOrigin: 'http://localhost' },
    database: {
      connections: {
        main: { seeds: { autoRun: true } },
      },
    },
    hub: { host: { enabled: false } },
  },
});

interface JsonResponse {
  readonly data?: unknown;
  readonly items?: unknown;
}

interface TicketRecord {
  readonly id: number;
  readonly ticketNo: string;
  readonly status: string;
  readonly ownerId: string | null;
}

const DEMO_PASSWORD = 'Service@2026';

async function signIn(
  request: (path: string, init?: RequestInit) => Promise<Response>,
  username: string,
): Promise<string> {
  const response = await request('/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: DEMO_PASSWORD }),
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function jsonInit(cookie: string, body: unknown): RequestInit {
  return {
    method: 'POST',
    // A cookie-authenticated write is checked against a trusted origin.
    headers: {
      'content-type': 'application/json',
      cookie,
      origin: 'http://localhost',
    },
    body: JSON.stringify(body),
  };
}

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as JsonResponse;
  return payload.data as T;
}

async function waitForTicket(
  request: (path: string, init?: RequestInit) => Promise<Response>,
  cookie: string,
  id: number,
  predicate: (ticket: TicketRecord) => boolean,
): Promise<TicketRecord> {
  let last: TicketRecord | undefined;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await request(`/service/tickets/${id}`, {
      headers: { cookie },
    });
    if (response.status === 200) {
      const payload = (await response.json()) as {
        data: { ticket: TicketRecord };
      };
      last = payload.data.ticket;
      if (predicate(last)) return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Ticket ${id} did not reach the expected state; last was ${JSON.stringify(last)}`,
  );
}

/** Signature-only PNG bytes: enough for the server's magic-byte check. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
/** ZIP local-file header, which is what every DOCX starts with. */
const DOCX_BYTES = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
/** A 28-byte file named `.png` that is not a PNG at all. */
const CORRUPT_PNG_BYTES = new TextEncoder().encode(
  'this is not a real PNG image',
);

async function uploadFile(
  request: (path: string, init?: RequestInit) => Promise<Response>,
  cookie: string,
  name: string,
  bytes: Uint8Array,
  type: string,
): Promise<Response> {
  const form = new FormData();
  form.append('file', new File([bytes], name, { type }));
  return request('/ticketAttachments/uploadOne', {
    method: 'POST',
    headers: { cookie, origin: 'http://localhost' },
    body: form,
  });
}

describe('service work-order lifecycle', () => {
  test('refuses unauthenticated access to the service API', async ({
    request,
  }) => {
    const response = await request('/service/tickets');
    expect(response.status).toBe(401);
  });

  test('moves a ticket through acceptance, processing, result and closure', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const engineer = await signIn(request, 'svc.engineer.a');

    const engineers = await request('/service/engineers', {
      headers: { cookie: supervisor },
    });
    expect(engineers.status).toBe(200);
    const engineersData = (await engineers.json()) as {
      data: readonly { id: string; name: string }[];
    };
    const engineerA = engineersData.data.find((item) =>
      item.name.includes('Engineer A'),
    );
    expect(engineerA).toBeDefined();

    const created = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Lifecycle: spindle alarm on the JMP-V5 line',
        deviceSerial: 'JMP-CNC-001',
        priority: 'urgent',
      }),
    );
    expect(created.status).toBe(201);
    const ticket = await readData<TicketRecord>(created);
    expect(ticket.status).toBe('pendingAcceptance');

    const accepted = await request(
      `/service/tickets/${ticket.id}/accept`,
      jsonInit(supervisor, {
        accept: true,
        ownerId: engineerA!.id,
        priority: 'urgent',
      }),
    );
    expect(accepted.status).toBe(200);
    const acceptedTicket = await waitForTicket(
      request,
      supervisor,
      ticket.id,
      (item) => item.status === 'pending',
    );
    expect(acceptedTicket.ownerId).toBe(engineerA!.id);

    const processing = await request(
      `/service/tickets/${ticket.id}/process`,
      jsonInit(engineer, {}),
    );
    expect(processing.status).toBe(200);
    await waitForTicket(
      request,
      engineer,
      ticket.id,
      (item) => item.status === 'processing',
    );

    const result = await request(
      `/service/tickets/${ticket.id}/result`,
      jsonInit(engineer, {
        result: 'Replaced the spindle cooling filter and reset the alarm.',
        resolutionNote: 'Cooling flow returned to spec; ran a 30 minute test.',
      }),
    );
    expect(result.status).toBe(200);
    await waitForTicket(
      request,
      engineer,
      ticket.id,
      (item) => item.status === 'pendingConfirmation',
    );

    const confirmed = await request(
      `/service/tickets/${ticket.id}/confirm`,
      jsonInit(supervisor, {}),
    );
    expect(confirmed.status).toBe(200);
    const closed = await waitForTicket(
      request,
      supervisor,
      ticket.id,
      (item) => item.status === 'closed',
    );
    expect(closed.status).toBe('closed');

    const logs = await request(`/service/tickets/${ticket.id}/logs`, {
      headers: { cookie: supervisor },
    });
    expect(logs.status).toBe(200);
    const logRows = await readData<readonly unknown[]>(logs);
    expect(logRows.length).toBeGreaterThanOrEqual(3);
  });

  test('records a refused acceptance without changing the ticket to accepted', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const created = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Lifecycle: refused acceptance',
        deviceSerial: 'JMP-CNC-001',
      }),
    );
    const ticket = await readData<TicketRecord>(created);

    const refused = await request(
      `/service/tickets/${ticket.id}/accept`,
      jsonInit(supervisor, { accept: false, reason: 'Duplicate report' }),
    );
    expect(refused.status).toBe(200);
    const after = await waitForTicket(
      request,
      supervisor,
      ticket.id,
      (item) => item.status !== 'pendingAcceptance',
    );
    expect(after.status).not.toBe('pending');

    const logs = await request(`/service/tickets/${ticket.id}/logs`, {
      headers: { cookie: supervisor },
    });
    const logRows = await readData<readonly { status: string }[]>(logs);
    expect(logRows.some((row) => row.status === 'failed')).toBe(true);
  });
});

describe('service scope and permissions', () => {
  test('scopes the list to the engineer assigned the ticket', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const engineerB = await signIn(request, 'svc.engineer.b');

    const engineers = await request('/service/engineers', {
      headers: { cookie: supervisor },
    });
    const engineersData = (await engineers.json()) as {
      data: readonly { id: string; name: string }[];
    };
    const engineerA = engineersData.data.find((item) =>
      item.name.includes('Engineer A'),
    );

    const created = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Scope: assigned only to Engineer A',
        deviceSerial: 'JMP-CNC-001',
        priority: 'normal',
      }),
    );
    const ticket = await readData<TicketRecord>(created);
    expect(engineerA).toBeDefined();
    await request(
      `/service/tickets/${ticket.id}/accept`,
      jsonInit(supervisor, { accept: true, ownerId: engineerA!.id }),
    );
    await waitForTicket(
      request,
      supervisor,
      ticket.id,
      (item) => item.ownerId === engineerA!.id,
    );

    const otherList = await request('/service/tickets', {
      headers: { cookie: engineerB },
    });
    const otherPage = (await otherList.json()) as {
      data: { items: readonly { id: number }[] };
    };
    expect(otherPage.data.items.some((item) => item.id === ticket.id)).toBe(
      false,
    );

    const denied = await request(`/service/tickets/${ticket.id}`, {
      headers: { cookie: engineerB },
    });
    expect([403, 404]).toContain(denied.status);
  });

  test('lets a supervisor share a ticket read-only and revoke it', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const engineerB = await signIn(request, 'svc.engineer.b');

    const engineers = await request('/service/engineers', {
      headers: { cookie: supervisor },
    });
    const engineersData = (await engineers.json()) as {
      data: readonly { id: string; name: string }[];
    };
    const engineerBInfo = engineersData.data.find((item) =>
      item.name.includes('Engineer B'),
    );
    expect(engineerBInfo).toBeDefined();

    const created = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Share: read-only review',
        deviceSerial: 'JMP-CNC-001',
      }),
    );
    const ticket = await readData<TicketRecord>(created);

    const shared = await request(
      `/service/tickets/${ticket.id}/shares`,
      jsonInit(supervisor, { engineerId: engineerBInfo!.id }),
    );
    expect(shared.status).toBe(201);

    const canRead = await request(`/service/tickets/${ticket.id}`, {
      headers: { cookie: engineerB },
    });
    expect(canRead.status).toBe(200);

    const revoked = await request(
      `/service/tickets/${ticket.id}/shares/${engineerBInfo!.id}`,
      {
        method: 'DELETE',
        headers: { cookie: supervisor, origin: 'http://localhost' },
      },
    );
    expect(revoked.status).toBe(204);

    const denied = await request(`/service/tickets/${ticket.id}`, {
      headers: { cookie: engineerB },
    });
    expect([403, 404]).toContain(denied.status);
  });

  test('rejects anonymous attachment uploads and keeps bytes private', async ({
    request,
  }) => {
    const anonymous = await request('/ticketAttachments/uploadOne', {
      method: 'POST',
    });
    expect(anonymous.status).toBe(401);

    const missing = await request('/uploads/tickets/not-a-record.png');
    expect([401, 404]).toContain(missing.status);
  });
});

describe('device platform interface', () => {
  test('accepts a platform event once and treats a repeat as the same ticket', async ({
    request,
  }) => {
    const integration = await signIn(request, 'svc.integration');
    const eventNo = `PLATFORM-${Date.now()}`;

    const first = await request(
      '/service/external/tickets',
      jsonInit(integration, {
        eventNo,
        deviceSerial: 'JMP-CNC-001',
        title: 'Platform event: jam reported',
        problem: 'Conveyor jam reported by the device.',
        priority: 'urgent',
      }),
    );
    expect(first.status).toBe(201);
    const firstData = (await first.json()) as {
      data: {
        duplicate: boolean;
        ticket: { ticketNo: string; status: string };
      };
    };
    expect(firstData.data.duplicate).toBe(false);

    const second = await request(
      '/service/external/tickets',
      jsonInit(integration, {
        eventNo,
        deviceSerial: 'JMP-CNC-001',
        title: 'Platform event: jam reported again',
      }),
    );
    expect(second.status).toBe(200);
    const secondData = (await second.json()) as {
      data: { duplicate: boolean; ticket: { ticketNo: string } };
    };
    expect(secondData.data.duplicate).toBe(true);
    expect(secondData.data.ticket.ticketNo).toBe(
      firstData.data.ticket.ticketNo,
    );

    const readBack = await request(
      `/service/external/tickets/${firstData.data.ticket.ticketNo}`,
      { headers: { cookie: integration } },
    );
    expect(readBack.status).toBe(200);

    // Looking a ticket up by the platform's own event number is the integration
    // account's primary read path; it requires `externalEventNo` to be readable.
    const byEvent = await request(
      `/service/external/tickets?eventNo=${encodeURIComponent(eventNo)}`,
      { headers: { cookie: integration } },
    );
    expect(byEvent.status).toBe(200);
    const byEventRows =
      await readData<readonly { externalEventNo: string }[]>(byEvent);
    expect(byEventRows.length).toBeGreaterThan(0);
    expect(byEventRows[0].externalEventNo).toBe(eventNo);
  });
});

describe('scheduled operations', () => {
  test('generates inspection tasks only for due devices and idempotently', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const shanghaiDate = (date: Date): string =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
        date,
      );
    const plannedDate = shanghaiDate(new Date());
    const futureDate = shanghaiDate(new Date(Date.now() + 5 * 86400000));

    const devices = await readData<
      readonly { id: number; customerId: number }[]
    >(await request('/service/devices', { headers: { cookie: supervisor } }));
    const engineers = await readData<
      readonly { id: string; permissionSet: string }[]
    >(await request('/service/engineers', { headers: { cookie: supervisor } }));
    const engineer = engineers.find(
      (candidate) => candidate.permissionSet === 'service-engineer',
    );
    expect(engineer).toBeDefined();
    const customerId = devices[0].customerId;

    // One device is due today, one is scheduled for a later day. The due
    // filter must produce a task for the first and none for the second.
    const dueResponse = await request(
      '/service/devices',
      jsonInit(supervisor, {
        serial: `DUE-${Date.now()}`,
        name: 'Due inspection device',
        customerId,
        engineerId: engineer!.id,
        enabled: true,
        nextInspectionAt: `${plannedDate}T09:00:00.000`,
      }),
    );
    expect(dueResponse.status).toBe(201);
    const dueDevice = await readData<{ id: number }>(dueResponse);

    const futureResponse = await request(
      '/service/devices',
      jsonInit(supervisor, {
        serial: `FUTURE-${Date.now()}`,
        name: 'Future inspection device',
        customerId,
        engineerId: engineer!.id,
        enabled: true,
        nextInspectionAt: `${futureDate}T09:00:00.000`,
      }),
    );
    expect(futureResponse.status).toBe(201);
    const futureDevice = await readData<{ id: number }>(futureResponse);

    const first = await request(
      '/service/operations/generate-inspections',
      jsonInit(supervisor, {}),
    );
    expect(first.status).toBe(200);
    const firstRun = await readData<{ created: number }>(first);
    expect(firstRun.created).toBeGreaterThanOrEqual(1);

    const list = () =>
      request(`/service/inspections?plannedDate=${plannedDate}`, {
        headers: { cookie: supervisor },
      });
    const rowsBefore = await readData<
      readonly { id: number; deviceId: number }[]
    >(await list());
    expect(
      rowsBefore.filter((row) => String(row.deviceId) === String(dueDevice.id))
        .length,
    ).toBe(1);
    expect(
      rowsBefore.some(
        (row) => String(row.deviceId) === String(futureDevice.id),
      ),
    ).toBe(false);

    const again = await request(
      '/service/operations/generate-inspections',
      jsonInit(supervisor, {}),
    );
    expect(again.status).toBe(200);
    const secondRun = await readData<{ created: number }>(again);
    expect(secondRun.created).toBe(0);

    const rowsAfter = await readData<readonly { id: number }[]>(await list());
    expect(rowsAfter.length).toBe(rowsBefore.length);
    expect(new Set(rowsAfter.map((row) => row.id)).size).toBe(rowsAfter.length);
  });

  test('records the on-demand run and its execution record in the Scheduler', async ({
    request,
    database,
    app,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const definition = () =>
      database
        .query('main')
        .selectFrom('schedule_definitions')
        .select(['id', 'runCount', 'lastRunAt', 'nextRunAt'])
        .where('appName', '=', app.appName)
        .where('key', '=', 'service.daily-inspections')
        .executeTakeFirst<{
          id: string;
          runCount: number;
          lastRunAt: unknown;
          nextRunAt: unknown;
        }>();
    const before = await definition();
    expect(before).toBeDefined();

    const response = await request(
      '/service/operations/generate-inspections',
      jsonInit(supervisor, {}),
    );
    expect(response.status).toBe(200);
    const data = await readData<{
      scheduleId: string | null;
      occurrenceId: string | null;
      status: string;
      created: number;
    }>(response);
    // The on-demand run must go through the same Scheduler definition and
    // target as the timed firing, not straight to the business service.
    expect(data.scheduleId).toBe(before!.id);
    expect(data.occurrenceId).toBeTruthy();
    expect(data.status).toBe('succeeded');
    expect(typeof data.created).toBe('number');

    const after = await definition();
    expect(Number(after!.runCount)).toBe(Number(before!.runCount) + 1);
    expect(after!.lastRunAt).toBeTruthy();
    // The manual run records its own occurrence without clearing the plan's
    // next timed firing.
    expect(after!.nextRunAt).toEqual(before!.nextRunAt);

    const occurrence = await database
      .query('main')
      .selectFrom('schedule_occurrences')
      .select(['id', 'status', 'scheduleId'])
      .where('id', '=', data.occurrenceId!)
      .executeTakeFirst<{ id: string; status: string; scheduleId: string }>();
    expect(occurrence).toBeDefined();
    expect(occurrence!.scheduleId).toBe(before!.id);
    expect(occurrence!.status).toBe('succeeded');
  });

  test('reports the integration status the deployment really has', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const response = await request('/service/integration-status', {
      headers: { cookie: supervisor },
    });
    expect(response.status).toBe(200);
    const status = await readData<{
      authorization: boolean;
      workflow: boolean;
      scheduler: boolean;
      missing: readonly string[];
    }>(response);
    expect(status.authorization).toBe(true);
    expect(status.workflow).toBe(true);
    expect(status.scheduler).toBe(true);
  });
});

describe('service assistant', () => {
  test('answers from accessible material with citations', async ({
    request,
  }) => {
    const engineer = await signIn(request, 'svc.engineer.a');

    const status = await request('/service/assistant/status', {
      headers: { cookie: engineer },
    });
    expect(status.status).toBe(200);

    const answer = await request(
      '/service/assistant/query',
      jsonInit(engineer, { question: 'spindle overheating', limit: 5 }),
    );
    expect(answer.status).toBe(200);
    const payload = await readData<{
      answer: string;
      citations: readonly { type: string; title: string }[];
      turns: readonly unknown[];
    }>(answer);
    expect(Array.isArray(payload.citations)).toBe(true);
    // Grounded retrieval must find the seeded material that mentions the topic.
    expect(payload.citations.length).toBeGreaterThan(0);
    expect(payload.answer.length).toBeGreaterThan(0);
    expect(payload.turns.length).toBeGreaterThan(0);

    const conversation = await request('/service/assistant/conversation', {
      headers: { cookie: engineer },
    });
    expect(conversation.status).toBe(200);
    const turns = await readData<readonly unknown[]>(conversation);
    expect(turns.length).toBeGreaterThan(0);

    const cleared = await request('/service/assistant/conversation', {
      method: 'DELETE',
      headers: { cookie: engineer, origin: 'http://localhost' },
    });
    expect(cleared.status).toBe(200);
    const clearedData = await readData<{ cleared: number }>(cleared);
    expect(typeof clearedData.cleared).toBe('number');
  });
});

describe('service messages and dashboard', () => {
  test('counts dashboard workload for the signed-in supervisor', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const response = await request('/service/dashboard', {
      headers: { cookie: supervisor },
    });
    expect(response.status).toBe(200);
    const summary = await readData<{
      total: number;
      byStatus: Record<string, number>;
      pendingInspectionsToday: number;
      byEngineer: readonly {
        engineerId: string;
        name: string;
        total: number;
        open: number;
      }[];
    }>(response);
    expect(typeof summary.total).toBe('number');
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.byStatus).toBeTypeOf('object');
    expect(typeof summary.pendingInspectionsToday).toBe('number');
    // Both engineers hold the engineer permission set, so both appear even
    // before they own a ticket.
    expect(Array.isArray(summary.byEngineer)).toBe(true);
    expect(summary.byEngineer.length).toBeGreaterThanOrEqual(2);
    expect(
      summary.byEngineer.every(
        (entry) =>
          typeof entry.engineerId === 'string' &&
          typeof entry.total === 'number' &&
          typeof entry.open === 'number',
      ),
    ).toBe(true);
  });

  test('marks an in-app message read for its recipient', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const response = await request('/service/messages', {
      headers: { cookie: supervisor },
    });
    expect(response.status).toBe(200);
    const messages =
      await readData<readonly { id: number; read: boolean | number }[]>(
        response,
      );
    expect(Array.isArray(messages)).toBe(true);
  });

  test('marks an unread message read without asking for an updatedAt column', async ({
    request,
  }) => {
    // The lifecycle test above accepted a ticket for Engineer A, which wrote
    // their in-app notification, so this account has an unread message.
    const engineer = await signIn(request, 'svc.engineer.a');
    const inbox = await readData<
      readonly { id: number; recipientId: string; read: boolean | number }[]
    >(await request('/service/messages', { headers: { cookie: engineer } }));
    const unread = inbox.find((message) => !message.read);
    expect(unread).toBeDefined();

    const marked = await request(
      `/service/messages/${unread!.id}/read`,
      jsonInit(engineer, {}),
    );
    // The bug asked the ORM to write `updatedAt`, a column this collection does
    // not have, and answered 400 FIELD_NOT_FOUND.
    expect(marked.status).toBe(200);
    const markedRecord = await readData<{ read: boolean | number }>(marked);
    expect(Boolean(markedRecord.read)).toBe(true);

    const relisted = await readData<
      readonly { id: number; read: boolean | number }[]
    >(await request('/service/messages', { headers: { cookie: engineer } }));
    expect(Boolean(relisted.find((item) => item.id === unread!.id)?.read)).toBe(
      true,
    );
  });
});

describe('service defect repair verification', () => {
  interface AcceptanceLogRow {
    readonly step: string;
    readonly status: string;
  }

  interface MessageRow {
    readonly id: number;
    readonly kind: string;
    readonly ticketId: string | null;
  }

  test('keeps a repeated acceptance decision idempotent', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const engineer = await signIn(request, 'svc.engineer.a');
    const engineers = await readData<readonly { id: string; name: string }[]>(
      await request('/service/engineers', { headers: { cookie: supervisor } }),
    );
    const engineerA = engineers.find((item) =>
      item.name.includes('Engineer A'),
    );
    expect(engineerA).toBeDefined();

    const created = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Idempotence: repeated acceptance decision',
        deviceSerial: 'JMP-CNC-001',
      }),
    );
    const ticket = await readData<TicketRecord>(created);

    const readDetail = async () => {
      const response = await request(`/service/tickets/${ticket.id}`, {
        headers: { cookie: supervisor },
      });
      expect(response.status).toBe(200);
      return readData<{
        ticket: TicketRecord;
        logs: readonly AcceptanceLogRow[];
      }>(response);
    };
    const assignedMessages = async () => {
      const rows = await readData<readonly MessageRow[]>(
        await request('/service/messages', { headers: { cookie: engineer } }),
      );
      return rows.filter(
        (row) =>
          row.kind === 'ticket.assigned' && row.ticketId === String(ticket.id),
      ).length;
    };

    const first = await request(
      `/service/tickets/${ticket.id}/accept`,
      jsonInit(supervisor, { accept: true, ownerId: engineerA!.id }),
    );
    expect(first.status).toBe(200);
    await waitForTicket(
      request,
      supervisor,
      ticket.id,
      (item) => item.status === 'pending',
    );

    const before = await readDetail();
    expect(
      before.logs.filter(
        (row) => row.step === 'accepted' && row.status === 'success',
      ),
    ).toHaveLength(1);
    expect(before.logs.filter((row) => row.status === 'failed')).toHaveLength(
      0,
    );
    const messagesBefore = await assignedMessages();
    expect(messagesBefore).toBeGreaterThanOrEqual(1);

    // A second and third identical decision are no-ops, not new workflow runs.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const repeat = await request(
        `/service/tickets/${ticket.id}/accept`,
        jsonInit(supervisor, { accept: true, ownerId: engineerA!.id }),
      );
      expect(repeat.status).toBe(200);
      const repeatBody = await readData<{ status: string }>(repeat);
      expect(repeatBody.status).toBe('already-accepted');
    }

    const after = await readDetail();
    expect(after.ticket.status).toBe('pending');
    expect(after.ticket.ownerId).toBe(engineerA!.id);
    expect(
      after.logs.filter(
        (row) => row.step === 'accepted' && row.status === 'success',
      ),
    ).toHaveLength(1);
    expect(after.logs.filter((row) => row.status === 'failed')).toHaveLength(0);
    expect(await assignedMessages()).toBe(messagesBefore);
  });

  test('shows an observer only the summary, not logs, shares or attachment bytes', async ({
    request,
    fetch,
    testApp,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const observer = await signIn(request, 'svc.observer');

    const visible = await readData<{
      items: readonly { id: number; confidential: boolean }[];
    }>(await request('/service/tickets', { headers: { cookie: observer } }));
    const ticket = visible.items.find((item) => !item.confidential);
    expect(ticket).toBeDefined();

    const upload = await uploadFile(
      request,
      supervisor,
      'observer-photo.png',
      PNG_BYTES,
      'image/png',
    );
    expect(upload.status).toBe(201);
    const fileId = (
      (await upload.json()) as { data: { record: { id: string } } }
    ).data.record.id;
    const linked = await request(
      `/service/tickets/${ticket!.id}/attachments`,
      jsonInit(supervisor, { fileId, category: 'photo' }),
    );
    expect(linked.status).toBe(201);

    const detailResponse = await request(`/service/tickets/${ticket!.id}`, {
      headers: { cookie: observer },
    });
    expect(detailResponse.status).toBe(200);
    const detail = await readData<{
      access: string;
      logs: readonly unknown[];
      shares: readonly unknown[];
      attachments: readonly unknown[];
    }>(detailResponse);
    expect(detail.access).toBe('summary');
    expect(detail.logs).toEqual([]);
    expect(detail.shares).toEqual([]);
    expect(detail.attachments).toEqual([]);

    for (const suffix of ['logs', 'shares', 'attachments']) {
      const denied = await request(`/service/tickets/${ticket!.id}/${suffix}`, {
        headers: { cookie: observer },
      });
      expect(denied.status).toBe(403);
    }

    // Holding the address is not enough: the guard refuses the bytes too, while
    // the supervisor who may read the ticket still gets them.
    const bytesUrl = `http://localhost${testApp.publicBasePath}/uploads/tickets/${fileId}.png`;
    const deniedBytes = await fetch(
      new Request(bytesUrl, { headers: { cookie: observer } }),
    );
    expect(deniedBytes.status).toBe(403);
    const allowedBytes = await fetch(
      new Request(bytesUrl, { headers: { cookie: supervisor } }),
    );
    expect(allowedBytes.status).toBe(200);
  });

  test('rejects a corrupt PNG and keeps a genuine DOCX report', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const created = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Attachments: content validation',
        deviceSerial: 'JMP-CNC-001',
      }),
    );
    const ticket = await readData<TicketRecord>(created);

    const corrupt = await uploadFile(
      request,
      supervisor,
      'corrupt.png',
      CORRUPT_PNG_BYTES,
      'image/png',
    );
    expect(corrupt.status).toBe(201);
    const corruptId = (
      (await corrupt.json()) as { data: { record: { id: string } } }
    ).data.record.id;

    const rejected = await request(
      `/service/tickets/${ticket.id}/attachments`,
      jsonInit(supervisor, { fileId: corruptId, category: 'photo' }),
    );
    expect(rejected.status).toBe(400);
    const rejectedBody = (await rejected.json()) as {
      error?: { reason?: string };
    };
    expect(rejectedBody.error?.reason).toBe(
      'SERVICE_ATTACHMENT_CONTENT_INVALID',
    );

    // The mislabelled record is discarded, so it never becomes a ticket file.
    const afterCorrupt = await readData<readonly { id: string }[]>(
      await request(`/service/tickets/${ticket.id}/attachments`, {
        headers: { cookie: supervisor },
      }),
    );
    expect(afterCorrupt.some((item) => item.id === corruptId)).toBe(false);

    const report = await uploadFile(
      request,
      supervisor,
      'report.docx',
      DOCX_BYTES,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(report.status).toBe(201);
    const reportId = (
      (await report.json()) as { data: { record: { id: string } } }
    ).data.record.id;
    const kept = await request(
      `/service/tickets/${ticket.id}/attachments`,
      jsonInit(supervisor, { fileId: reportId, category: 'report' }),
    );
    expect(kept.status).toBe(201);
    const afterReport = await readData<readonly { id: string }[]>(
      await request(`/service/tickets/${ticket.id}/attachments`, {
        headers: { cookie: supervisor },
      }),
    );
    expect(afterReport.some((item) => item.id === reportId)).toBe(true);
  });

  test('runs overdue reminders without the date-filter capability error', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const created = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Overdue reminder candidate',
        deviceSerial: 'JMP-CNC-001',
        dueAt: new Date(Date.now() - 86400000).toISOString(),
      }),
    );
    const ticket = await readData<TicketRecord>(created);
    expect(ticket.status).toBe('pendingAcceptance');

    const first = await request(
      '/service/operations/send-overdue-reminders',
      jsonInit(supervisor, {}),
    );
    expect(first.status).toBe(200);
    const firstRun = await readData<{ created: number; skipped: number }>(
      first,
    );
    expect(firstRun.created).toBeGreaterThanOrEqual(1);

    // Repeating the same day is a no-op, not another reminder.
    const second = await request(
      '/service/operations/send-overdue-reminders',
      jsonInit(supervisor, {}),
    );
    expect(second.status).toBe(200);
    const secondRun = await readData<{ created: number; skipped: number }>(
      second,
    );
    expect(secondRun.created).toBe(0);
    expect(secondRun.skipped).toBeGreaterThanOrEqual(1);
  });

  test('does not remind about an overdue ticket that is already closed', async ({
    request,
    database,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const nowIso = new Date().toISOString();
    const closedOverdue = await database
      .query('main')
      .selectFrom('tickets')
      .select('id')
      .where('status', '=', 'closed')
      .where('dueAt', '<', nowIso)
      .executeTakeFirst<{ id: number }>();
    expect(closedOverdue).toBeDefined();

    const run = await request(
      '/service/operations/send-overdue-reminders',
      jsonInit(supervisor, {}),
    );
    expect(run.status).toBe(200);

    // The reminder query scans past-due tickets; a closed one must never
    // produce a reminder row.
    const reminders = await database
      .query('main')
      .selectFrom('overdue_reminders')
      .select('id')
      .where('ticketId', '=', closedOverdue!.id)
      .execute();
    expect(reminders.length).toBe(0);
  });

  test('produces a ticket-grounded draft without writing the ticket', async ({
    request,
  }) => {
    const engineer = await signIn(request, 'svc.engineer.a');
    const mine = await readData<{
      items: readonly TicketRecord[];
    }>(
      await request('/service/tickets?mine=true', {
        headers: { cookie: engineer },
      }),
    );
    const ticket = mine.items.find(
      (item) => item.status === 'pending' || item.status === 'processing',
    );
    expect(ticket).toBeDefined();

    const before = await readData<{ ticket: TicketRecord }>(
      await request(`/service/tickets/${ticket!.id}`, {
        headers: { cookie: engineer },
      }),
    );

    const answer = await request(
      '/service/assistant/query',
      jsonInit(engineer, { question: 'spindle over-temperature', limit: 5 }),
    );
    expect(answer.status).toBe(200);
    const payload = await readData<{
      answer: string;
      resolutionNoteDraft: string;
      citations: readonly unknown[];
    }>(answer);
    expect(payload.answer.length).toBeGreaterThan(0);
    expect(payload.resolutionNoteDraft.length).toBeGreaterThan(0);
    expect(payload.citations.length).toBeGreaterThan(0);

    // Asking must not change the business record; only an explicit submit does.
    const after = await readData<{ ticket: TicketRecord }>(
      await request(`/service/tickets/${ticket!.id}`, {
        headers: { cookie: engineer },
      }),
    );
    expect(after.ticket.status).toBe(before.ticket.status);
    expect(after.ticket.status).not.toBe('closed');
  });

  test('saves a confirmed assistant draft without changing the ticket', async ({
    request,
  }) => {
    const engineer = await signIn(request, 'svc.engineer.a');
    const mine = await readData<{ items: readonly TicketRecord[] }>(
      await request('/service/tickets?mine=true', {
        headers: { cookie: engineer },
      }),
    );
    const ticket = mine.items.find(
      (item) => item.status === 'pending' || item.status === 'processing',
    );
    expect(ticket).toBeDefined();

    // Confirming a draft is the explicit human step; the record exists but the
    // status does not move and the ticket is not closed.
    const saved = await request(
      `/service/tickets/${ticket!.id}/assistant-draft`,
      jsonInit(engineer, {
        draft: 'Check the spindle cooling loop, then replace the filter.',
      }),
    );
    expect(saved.status).toBe(200);
    const record = await readData<{
      status: string;
      assistantDraft: string | null;
    }>(saved);
    expect(record.assistantDraft).toContain('spindle');
    expect(record.status).toBe(ticket!.status);
    expect(record.status).not.toBe('closed');

    // A read-only observer holds no draft write on an internal ticket.
    const observer = await signIn(request, 'svc.observer');
    const forbidden = await request(
      `/service/tickets/${ticket!.id}/assistant-draft`,
      jsonInit(observer, { draft: 'observer draft' }),
    );
    expect([403, 404]).toContain(forbidden.status);
  });

  test('does not retrieve a confidential ticket for an observer', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const observer = await signIn(request, 'svc.observer');

    const all = await readData<{
      items: readonly { id: number; confidential: boolean }[];
    }>(await request('/service/tickets', { headers: { cookie: supervisor } }));
    const confidential = all.items.find((item) => item.confidential);
    expect(confidential).toBeDefined();

    // Neither the list nor the detail may surface a confidential ticket.
    const observerList = await readData<{
      items: readonly { id: number }[];
    }>(await request('/service/tickets', { headers: { cookie: observer } }));
    expect(
      observerList.items.some((item) => item.id === confidential!.id),
    ).toBe(false);

    const denied = await request(`/service/tickets/${confidential!.id}`, {
      headers: { cookie: observer },
    });
    expect([403, 404]).toContain(denied.status);

    const answer = await request(
      '/service/assistant/query',
      jsonInit(observer, {
        question: 'packaging jam transfer point',
        limit: 5,
      }),
    );
    expect(answer.status).toBe(200);
    const payload = await readData<{
      citations: readonly { type: string; id: number }[];
    }>(answer);
    expect(
      payload.citations.some(
        (citation) =>
          citation.type === 'ticket' && citation.id === confidential!.id,
      ),
    ).toBe(false);
  });
});

describe('service master data validation', () => {
  test('rejects a duplicate device serial on create and on update', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const devices = await readData<
      readonly { id: number; serial: string; customerId: number }[]
    >(await request('/service/devices', { headers: { cookie: supervisor } }));
    const [first, second] = devices;
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const duplicate = await request(
      '/service/devices',
      jsonInit(supervisor, {
        serial: first.serial,
        name: 'Duplicate serial device',
        customerId: Number(first.customerId),
      }),
    );
    expect(duplicate.status).toBe(409);
    const duplicateBody = (await duplicate.json()) as {
      error?: { reason?: string };
    };
    expect(duplicateBody.error?.reason).toBe('SERVICE_DEVICE_SERIAL_EXISTS');

    // Keeping the device's own serial is not a conflict.
    const same = await request(`/service/devices/${first.id}`, {
      ...jsonInit(supervisor, { serial: first.serial, name: 'Renamed' }),
      method: 'PATCH',
    });
    expect(same.status).toBe(200);

    // Claiming another device's serial is.
    const clash = await request(`/service/devices/${second.id}`, {
      ...jsonInit(supervisor, { serial: first.serial }),
      method: 'PATCH',
    });
    expect(clash.status).toBe(409);
  });

  test('accepts the partial temporal values the browser controls submit', async ({
    request,
  }) => {
    // `<input type="date">` sends a bare day for the next inspection, and
    // `<input type="datetime-local">` a day and time without seconds for the
    // due time. Both reach a `datetime` column and must be completed rather
    // than rejected as an invalid mutation.
    const supervisor = await signIn(request, 'svc.supervisor');
    const devices = await readData<
      readonly { id: number; customerId: number }[]
    >(await request('/service/devices', { headers: { cookie: supervisor } }));
    const customerId = devices[0].customerId;

    const created = await request(
      '/service/devices',
      jsonInit(supervisor, {
        serial: `DATEONLY-${Date.now()}`,
        name: 'Date-only inspection device',
        customerId,
        enabled: true,
        nextInspectionAt: '2026-10-22',
      }),
    );
    expect(created.status).toBe(201);
    const device = await readData<{
      id: number;
      nextInspectionAt: string;
    }>(created);
    expect(device.nextInspectionAt.slice(0, 10)).toBe('2026-10-22');

    const edited = await request(`/service/devices/${device.id}`, {
      ...jsonInit(supervisor, { nextInspectionAt: '2026-11-05' }),
      method: 'PATCH',
    });
    expect(edited.status).toBe(200);
    const editedDevice = await readData<{ nextInspectionAt: string }>(edited);
    expect(editedDevice.nextInspectionAt.slice(0, 10)).toBe('2026-11-05');

    const ticket = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Due time without seconds',
        deviceId: device.id,
        customerId,
        dueAt: '2026-10-22T09:30',
      }),
    );
    expect(ticket.status).toBe(201);
  });

  test('refuses a ticket for a mismatched customer or a disabled device', async ({
    request,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const devices = await readData<
      readonly { id: number; serial: string; customerId: number }[]
    >(await request('/service/devices', { headers: { cookie: supervisor } }));
    const customers = await readData<readonly { id: number }[]>(
      await request('/service/customers', { headers: { cookie: supervisor } }),
    );
    const device = devices[0];
    const otherCustomer = customers.find(
      (customer) => Number(customer.id) !== Number(device.customerId),
    );
    expect(otherCustomer).toBeDefined();

    const mismatch = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Mismatched customer',
        deviceId: device.id,
        customerId: otherCustomer!.id,
      }),
    );
    expect(mismatch.status).toBe(400);

    const matched = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Matched customer and device',
        deviceId: device.id,
        customerId: device.customerId,
      }),
    );
    expect(matched.status).toBe(201);

    const disabledDevice = await request(
      '/service/devices',
      jsonInit(supervisor, {
        serial: `DISABLED-${Date.now()}`,
        name: 'Disabled device',
        customerId: device.customerId,
        enabled: false,
      }),
    );
    expect(disabledDevice.status).toBe(201);
    const disabled = await readData<{ id: number }>(disabledDevice);

    const rejected = await request(
      '/service/tickets',
      jsonInit(supervisor, {
        title: 'Disabled device',
        deviceId: disabled.id,
        customerId: device.customerId,
      }),
    );
    expect(rejected.status).toBe(400);
  });
});

describe('service integration credentials', () => {
  test('lets a supervisor list and revoke an integration account key', async ({
    request,
  }) => {
    // The key is created the way the integration account itself would, then a
    // supervisor revokes it through the application's management entry. The
    // plugin's own page is self-service, so it cannot do this and the trusted
    // server operation has to be exposed by the application.
    const integration = await signIn(request, 'svc.integration');
    const created = await request(
      '/auth/api-key/create',
      jsonInit(integration, { name: `integration-key-${Date.now()}` }),
    );
    expect(created.status).toBe(200);
    const key = (await created.json()) as { id?: string; key?: string };
    expect(typeof key.id).toBe('string');
    expect(typeof key.key).toBe('string');

    const supervisor = await signIn(request, 'svc.supervisor');
    const listed = await readData<
      readonly { id: string; ownerName: string; enabled: boolean }[]
    >(
      await request('/service/integration/api-keys', {
        headers: { cookie: supervisor },
      }),
    );
    const found = listed.find((item) => item.id === key.id);
    expect(found).toBeDefined();
    expect(found!.enabled).toBe(true);

    // An engineer holds no service permission set and must not reach the list.
    const engineer = await signIn(request, 'svc.engineer.a');
    const forbidden = await request('/service/integration/api-keys', {
      headers: { cookie: engineer },
    });
    expect(forbidden.status).toBe(403);

    const revoked = await request(
      `/service/integration/api-keys/${key.id}/revoke`,
      jsonInit(supervisor, {}),
    );
    expect(revoked.status).toBe(200);

    // The revoked key authenticates nothing any more.
    const afterRevoke = await request('/service/me', {
      headers: { 'x-api-key': key.key! },
    });
    expect(afterRevoke.status).toBe(401);
  });
});

describe('scheduled operations guard', () => {
  test('refuses the on-demand run while the schedule is disabled', async ({
    request,
    database,
    app,
  }) => {
    const supervisor = await signIn(request, 'svc.supervisor');
    const table = () =>
      database
        .query('main')
        .updateTable('schedule_definitions')
        .where('appName', '=', app.appName)
        .where('key', '=', 'service.daily-inspections');
    const existing = await database
      .query('main')
      .selectFrom('schedule_definitions')
      .select(['key', 'enabled'])
      .where('appName', '=', app.appName)
      .where('key', '=', 'service.daily-inspections')
      .execute();
    expect(existing.length).toBeGreaterThan(0);

    await table().set({ enabled: false }).execute();
    try {
      const refused = await request(
        '/service/operations/generate-inspections',
        jsonInit(supervisor, {}),
      );
      expect(refused.status).toBe(400);
    } finally {
      await table().set({ enabled: true }).execute();
    }

    const resumed = await request(
      '/service/operations/generate-inspections',
      jsonInit(supervisor, {}),
    );
    expect(resumed.status).toBe(200);
  });
});
