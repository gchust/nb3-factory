// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import repairApiRoutes from '../../server/routes/repair.js';
import { RepairService } from '../../server/providers/repair-service.js';

import { createRepairTestDatabase } from '../helpers/repair-db.js';

let database: Awaited<ReturnType<typeof createRepairTestDatabase>>;
let router: Hono;

const STORED_BYTES = new Uint8Array([104, 101, 108, 108, 111]);

async function buildRouter(): Promise<Hono> {
  const manager = database.manager;
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, manager as never);
  container.instance(authenticationToken, {
    // The production middleware rejects anonymous requests; this double does the same and
    // reads the caller from a header so a test can act as any role.
    required: () => async (context: never, next: never) => {
      const req = (
        context as { req: { header(name: string): string | undefined } }
      ).req;
      const nextFn = next as () => Promise<void>;
      const userId = req.header('x-test-user');
      if (!userId) {
        return (
          context as { json(body: unknown, status: number): Response }
        ).json({ code: 'UNAUTHORIZED' }, 401);
      }
      (context as { set(key: string, value: unknown): void }).set('auth', {
        user: { id: userId, name: `name-${userId}` },
      });
      await nextFn();
      return undefined;
    },
  } as never);
  container.instance(driveManagerToken, {
    // The drive service's method is named `use`; it is not a React hook.
    // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
    use: () => ({
      getBytes: async () => STORED_BYTES,
      delete: async () => undefined,
    }),
  } as never);
  container.instance(serverFileRepositoryManagerToken, {
    repository: () => ({
      uploadMany: async () => ({ createdCount: 0, records: [] }),
    }),
  } as never);

  const app = {
    container,
    publicBasePath: '/main',
    config: {
      get: (key: string) =>
        key === 'drive'
          ? {
              default: 'local',
              disks: {
                local: {
                  driver: 'fs',
                  location: '/tmp',
                  visibility: 'private',
                },
              },
            }
          : undefined,
    },
  } as unknown as Application;

  return repairApiRoutes.createRouter(app);
}

async function seedTicket(
  reporterId: string,
  assigneeId?: string,
): Promise<{ ticketId: number; fileId: string }> {
  const query = database.manager.query();
  const now = new Date();
  const existingBuilding = await query
    .selectFrom('buildings')
    .select(['id'])
    .where('code', '=', 'A')
    .executeTakeFirst();
  const building = existingBuilding
    ? { insertId: (existingBuilding as { id: number }).id }
    : await query
        .insertInto('buildings')
        .values({
          code: 'A',
          name: 'Building A',
          address: null,
          floors: 1,
          manager: null,
          remark: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
  const buildingId = Number(building.insertId);
  // Fixture rows are inserted once per database; a second ticket reuses them.
  if (!existingBuilding) {
    await query
      .insertInto('repairMembers')
      .values([
        {
          userId: reporterId,
          role: 'reporter',
          displayName: 'Reporter',
          createdAt: now,
          updatedAt: now,
        },
        {
          userId: 'user-dispatcher',
          role: 'dispatcher',
          displayName: 'Dispatcher',
          createdAt: now,
          updatedAt: now,
        },
        {
          userId: 'user-supervisor',
          role: 'supervisor',
          displayName: 'Supervisor',
          createdAt: now,
          updatedAt: now,
        },
        {
          userId: 'user-finance',
          role: 'finance',
          displayName: 'Finance',
          createdAt: now,
          updatedAt: now,
        },
        {
          userId: 'user-tech',
          role: 'technician',
          displayName: 'Technician',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();
  }
  const service = new RepairService(database.manager);
  const ticketId = await service.createTicket(
    {
      userId: reporterId,
      name: 'Reporter',
      role: 'reporter',
    },
    {
      title: 'Leaking pipe',
      buildingId,
      location: 'A 101',
      faultType: 'plumbing',
      description: 'Water under the sink',
      contactName: 'Reporter',
      contactPhone: '1',
    },
  );
  const fileId = crypto.randomUUID();
  await query
    .insertInto('repairFiles')
    .values({
      id: fileId,
      disk: 'local',
      key: `test/${fileId}`,
      filename: 'photo.png',
      ext: 'png',
      mimeType: 'image/png',
      size: STORED_BYTES.byteLength,
      uploadedById: reporterId,
      uploadedByName: 'Reporter',
      note: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await service.linkFiles(
    { userId: reporterId, name: 'Reporter', role: 'reporter' },
    ticketId,
    [fileId],
    'fault',
    null,
  );
  if (assigneeId) {
    await service.dispatchTicket(
      { userId: 'user-dispatcher', name: 'Dispatcher', role: 'dispatcher' },
      ticketId,
      {
        assigneeId,
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    );
  }
  return { ticketId, fileId };
}

function get(path: string, userId?: string): Promise<Response> {
  return router.request(
    path,
    userId ? { headers: { 'x-test-user': userId } } : undefined,
  );
}

function post(
  path: string,
  userId: string,
  json: Record<string, unknown> = {},
): Promise<Response> {
  return router.request(path, {
    method: 'POST',
    headers: { 'x-test-user': userId, 'content-type': 'application/json' },
    body: JSON.stringify(json),
  });
}

function patch(
  path: string,
  userId: string,
  json: Record<string, unknown> = {},
): Promise<Response> {
  return router.request(path, {
    method: 'PATCH',
    headers: { 'x-test-user': userId, 'content-type': 'application/json' },
    body: JSON.stringify(json),
  });
}

beforeEach(async () => {
  database = await createRepairTestDatabase();
  router = await buildRouter();
});

afterEach(async () => {
  await database.cleanup();
});

it('rejects anonymous requests on every repair path', async () => {
  expect((await get('/repair/tickets')).status).toBe(401);
  expect((await get('/repair/dashboard')).status).toBe(401);
  expect((await get('/repair/session')).status).toBe(401);
  expect((await get('/repair/files')).status).toBe(401);
  expect((await get('/repair/files/content/anything')).status).toBe(401);
});

it('scopes ticket reads by role through the real route factory', async () => {
  await seedTicket('user-reporter');
  await seedTicket('user-someone-else');

  const reporter = await get('/repair/tickets', 'user-reporter');
  expect(reporter.status).toBe(200);
  const payload = (await reporter.json()) as {
    data: { total: number; rows: { reporterId: string }[] };
  };
  expect(payload.data.total).toBe(1);
  expect(payload.data.rows[0]?.reporterId).toBe('user-reporter');

  const supervisor = await get('/repair/tickets', 'user-supervisor');
  expect(
    ((await supervisor.json()) as { data: { total: number } }).data.total,
  ).toBe(2);
});

it('denies cross-user reads and privileged actions with 403', async () => {
  const { ticketId } = await seedTicket('user-reporter');

  const crossRead = await get(`/repair/tickets/${ticketId}`, 'user-unknown');
  expect(crossRead.status).toBe(403);

  const missing = await get('/repair/tickets/9999', 'user-supervisor');
  expect(missing.status).toBe(404);

  const settle = await post(
    `/repair/tickets/${ticketId}/settle`,
    'user-reporter',
  );
  expect(settle.status).toBe(403);

  const unauthorizedDispatch = await post(
    `/repair/tickets/${ticketId}/dispatch`,
    'user-reporter',
    { assigneeId: 'x', dueAt: new Date().toISOString() },
  );
  expect(unauthorizedDispatch.status).toBe(403);
});

it('allows a permitted action and reports validation errors', async () => {
  const { ticketId } = await seedTicket('user-reporter');

  const technicianDispatch = await post(
    `/repair/tickets/${ticketId}/dispatch`,
    'user-tech',
  );
  expect(technicianDispatch.status).toBe(403);

  const dispatched = await post(
    `/repair/tickets/${ticketId}/dispatch`,
    'user-dispatcher',
    {
      assigneeId: 'user-tech',
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  );
  expect(dispatched.status).toBe(200);
  const body = (await dispatched.json()) as {
    data: { status: string; assigneeId: string };
  };
  expect(body.data.status).toBe('assigned');
  expect(body.data.assigneeId).toBe('user-tech');

  const missingReason = await post(
    `/repair/tickets/${ticketId}/cancel`,
    'user-supervisor',
  );
  expect(missingReason.status).toBe(400);
});

it('serves file bytes only to a caller with ticket access', async () => {
  const { fileId } = await seedTicket('user-reporter');

  const allowed = await get(`/repair/files/content/${fileId}`, 'user-reporter');
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get('content-type')).toBe('image/png');
  expect(Array.from(new Uint8Array(await allowed.arrayBuffer()))).toEqual(
    Array.from(STORED_BYTES),
  );

  const supervisor = await get(
    `/repair/files/content/${fileId}`,
    'user-supervisor',
  );
  expect(supervisor.status).toBe(200);

  const denied = await get(`/repair/files/content/${fileId}`, 'user-unknown');
  expect(denied.status).toBe(403);

  const missing = await get(
    `/repair/files/content/${crypto.randomUUID()}`,
    'user-supervisor',
  );
  expect(missing.status).toBe(404);
});

it('persists a renamed file and its note on the attachment the caller later reads', async () => {
  const { ticketId, fileId } = await seedTicket('user-reporter');

  const renamed = await patch(`/repair/files/${fileId}`, 'user-reporter', {
    filename: 'renamed.png',
    note: 'Before the repair',
  });
  expect(renamed.status).toBe(200);

  const detail = await get(`/repair/tickets/${ticketId}`, 'user-reporter');
  expect(detail.status).toBe(200);
  const payload = (await detail.json()) as {
    data: { attachments: { fileId: string; filename: string; note: string }[] };
  };
  const attachment = payload.data.attachments.find(
    (item) => item.fileId === fileId,
  );
  // The note must come back from the same read the UI uses, not only from the file record.
  expect(attachment).toMatchObject({
    filename: 'renamed.png',
    note: 'Before the repair',
  });

  // A caller without ticket access cannot change the attachment.
  const denied = await patch(`/repair/files/${fileId}`, 'user-unknown', {
    note: 'hijack',
  });
  expect(denied.status).toBe(403);
});

it('refuses a file upload that exceeds the per-upload file count', async () => {
  const { ticketId } = await seedTicket('user-reporter');
  const form = new FormData();
  form.append('category', 'fault');
  for (let index = 0; index < 6; index += 1) {
    form.append(
      'files',
      new File(['x'], `f${index}.png`, { type: 'image/png' }),
    );
  }
  const response = await router.request(`/repair/tickets/${ticketId}/files`, {
    method: 'POST',
    headers: { 'x-test-user': 'user-reporter' },
    body: form,
  });
  expect(response.status).toBe(400);
  expect(((await response.json()) as { code: string }).code).toBe(
    'TOO_MANY_FILES',
  );
});
