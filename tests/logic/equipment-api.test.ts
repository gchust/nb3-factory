// @vitest-environment node
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

// Starting the application installs its migrations and, because sample data is on, the fictional devices the ledger
// ships with. Every test in this file meets the route through the application's own authentication.
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { sampleData: true, publicOrigin: 'http://localhost' },
  },
  server: {
    env: {
      SECRETS_KEYS:
        '1:36d1eb097bed66813e951c7af7d512ad49136730d0ec18e2c1149458bc59c82d',
    },
  },
});

async function createEquipment(
  session: Awaited<ReturnType<typeof signIn>>,
  values: Record<string, unknown>,
): Promise<Response> {
  return session.fetch('/equipments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(values),
  });
}

test('keeps the ledger behind a session and loads the sample devices', async ({
  request,
  testApp,
}) => {
  const anonymous = await request('/equipments');
  expect(anonymous.status).toBe(401);

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/equipments?pageSize=100');
  expect(response.status).toBe(200);

  const body = (await response.json()) as {
    data: { code: string; name: string; status: string }[];
  };
  expect(body.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'EQ-001',
        name: 'Field Camera',
        status: 'available',
      }),
      expect.objectContaining({
        code: 'EQ-002',
        name: 'Portable Projector',
        status: 'borrowed',
      }),
    ]),
  );
});

test('creates, reads, updates and filters a device without translating its data', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const code = `API-${Date.now()}`;
  const createdResponse = await createEquipment(admin, {
    code,
    name: '现场相机',
    status: 'available',
    notes: '  用于现场勘察。  ',
  });
  expect(createdResponse.status).toBe(201);
  const created = (await createdResponse.json()) as {
    data: {
      id: string;
      code: string;
      name: string;
      status: string;
      notes: string | null;
    };
  };
  expect(created.data).toMatchObject({
    code,
    name: '现场相机',
    status: 'available',
    notes: '用于现场勘察。',
  });
  expect(typeof created.data.id).toBe('string');

  const withoutNotes = await createEquipment(admin, {
    code: `${code}-EMPTY`,
    name: 'No notes',
    status: 'available',
    notes: null,
  });
  expect(withoutNotes.status).toBe(201);
  await expect(withoutNotes.json()).resolves.toMatchObject({
    data: { notes: null },
  });

  const readResponse = await admin.fetch(`/equipments/${created.data.id}`);
  expect(readResponse.status).toBe(200);
  await expect(readResponse.json()).resolves.toEqual({ data: created.data });

  const updateResponse = await admin.fetch(`/equipments/${created.data.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      name: 'Field Camera / 现场相机',
      status: 'borrowed',
      notes: null,
    }),
  });
  expect(updateResponse.status).toBe(200);
  await expect(updateResponse.json()).resolves.toMatchObject({
    data: {
      id: created.data.id,
      code,
      name: 'Field Camera / 现场相机',
      status: 'borrowed',
      notes: null,
    },
  });

  const borrowed = (await (
    await admin.fetch('/equipments?status=borrowed&pageSize=100')
  ).json()) as { data: { id: string }[] };
  expect(borrowed.data.map(({ id }) => id)).toContain(created.data.id);

  const available = (await (
    await admin.fetch('/equipments?status=available&pageSize=100')
  ).json()) as { data: { id: string }[] };
  expect(available.data.map(({ id }) => id)).not.toContain(created.data.id);
});

test('reports validation, duplicate codes and missing records with stable reasons', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const code = `DUP-${Date.now()}`;

  const missingName = await createEquipment(admin, {
    code,
    name: '',
    status: 'available',
  });
  expect(missingName.status).toBe(400);

  const first = await createEquipment(admin, {
    code,
    name: 'Duplicate test',
    status: 'available',
  });
  expect(first.status).toBe(201);
  const { data } = (await first.json()) as { data: { id: string } };

  const duplicate = await createEquipment(admin, {
    code,
    name: 'Another name',
    status: 'borrowed',
  });
  expect(duplicate.status).toBe(409);
  await expect(duplicate.json()).resolves.toMatchObject({
    error: {
      reason: 'EQUIPMENT_CODE_TAKEN',
      domain: 'nb3-factory',
      fieldViolations: [expect.objectContaining({ field: 'code' })],
    },
  });

  const duplicateUpdate = await admin.fetch(`/equipments/${data.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ code: 'EQ-001' }),
  });
  expect(duplicateUpdate.status).toBe(409);

  const invalidStatus = await admin.fetch(`/equipments/${data.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ status: 'lost' }),
  });
  expect(invalidStatus.status).toBe(400);

  const missing = await admin.fetch('/equipments/999999999');
  expect(missing.status).toBe(404);
  await expect(missing.json()).resolves.toMatchObject({
    error: { reason: 'EQUIPMENT_NOT_FOUND', domain: 'nb3-factory' },
  });
});

test('pages the ledger and exposes no delete operation', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const page = (await (
    await admin.fetch('/equipments?page=1&pageSize=1')
  ).json()) as {
    data: { id: string }[];
    meta: { page: number; pageSize: number; total: number };
  };
  expect(page.data).toHaveLength(1);
  expect(page.meta).toMatchObject({ page: 1, pageSize: 1 });
  expect(page.meta.total).toBeGreaterThanOrEqual(2);

  const deleteResponse = await admin.fetch('/equipments/EQ-001', {
    method: 'DELETE',
    headers: { origin: 'http://localhost' },
  });
  expect(deleteResponse.status).toBe(404);
});

test('declares every equipment route in the API document', async ({
  testApp,
}) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  expect(document.paths?.['/api/equipments']?.get?.operationId).toBe(
    'listEquipments',
  );
  expect(document.paths?.['/api/equipments']?.post?.operationId).toBe(
    'createEquipment',
  );
  expect(document.paths?.['/api/equipments/{id}']?.get?.operationId).toBe(
    'getEquipment',
  );
  expect(document.paths?.['/api/equipments/{id}']?.patch?.operationId).toBe(
    'updateEquipment',
  );
  expect(document.paths?.['/api/equipments/{id}']?.delete).toBeUndefined();
});
