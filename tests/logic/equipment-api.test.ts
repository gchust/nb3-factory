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

interface EquipmentBody {
  readonly data: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly status: string;
    readonly notes: string | null;
  };
  readonly meta?: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/** The origin requests are addressed to; the application's cookie-authenticated writes trust it. */
const testOrigin = 'http://localhost';

const test = createAppTest({
  createServer: createStandaloneServer,
  // A test application has no `config.yml` for `pnpm nocobase config init` to generate secrets into, so the
  // authentication plugin's keys are supplied here. The public origin is declared too, so the cookie-write origin
  // check trusts the requests this test sends.
  config: {
    app: { publicOrigin: testOrigin },
    secrets: {
      keys: [{ version: 1, key: '0123456789abcdef'.repeat(4) }],
    },
  },
});

function jsonWrite(
  method: 'POST' | 'PATCH',
  body: unknown,
): { method: string; headers: Record<string, string>; body: string } {
  return {
    method,
    headers: { 'content-type': 'application/json', origin: testOrigin },
    body: JSON.stringify(body),
  };
}

test('requires a session for every ledger route', async ({ request }) => {
  expect((await request('/equipment')).status).toBe(401);
  expect(
    (
      await request('/equipment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'EQ-9000',
          name: 'Anonymous',
          status: 'available',
          notes: null,
        }),
      })
    ).status,
  ).toBe(401);
});

test('lists the seeded devices and filters by status', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const all = await admin.fetch('/equipment');
  expect(all.status).toBe(200);
  const body = (await all.json()) as EquipmentBody;
  // The two seeded devices are listed together with anything an earlier test inserted.
  expect(body.data.map((row) => row.code)).toEqual(
    expect.arrayContaining(['EQ-0001', 'EQ-0002']),
  );
  expect(body.meta?.total).toBeGreaterThanOrEqual(2);

  const borrowed = await admin.fetch('/equipment?status=borrowed');
  expect(borrowed.status).toBe(200);
  const filtered = (await borrowed.json()) as EquipmentBody;
  expect(filtered.data.map((row) => row.code)).toContain('EQ-0002');
  expect(filtered.data.every((row) => row.status === 'borrowed')).toBe(true);
});

test('adds a device, keeps user text as entered, and refuses a duplicate code', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const created = await admin.fetch(
    '/equipment',
    jsonWrite('POST', {
      code: 'EQ-1000',
      // User-entered text is stored verbatim and never translated.
      name: '会议室投影仪',
      status: 'available',
      notes: null,
    }),
  );
  expect(created.status).toBe(201);
  const createdBody = (await created.json()) as EquipmentBody;
  expect(createdBody.data.name).toBe('会议室投影仪');

  const duplicate = await admin.fetch(
    '/equipment',
    jsonWrite('POST', {
      code: 'EQ-1000',
      name: 'Duplicate',
      status: 'available',
      notes: null,
    }),
  );
  expect(duplicate.status).toBe(409);
  const error = (await duplicate.json()) as { error: { reason: string } };
  expect(error.error.reason).toBe('EQUIPMENT_CODE_TAKEN');

  // A blank name is a validation failure the client can map to a localized field error.
  const invalid = await admin.fetch(
    '/equipment',
    jsonWrite('POST', {
      code: 'EQ-1001',
      name: '',
      status: 'available',
      notes: null,
    }),
  );
  expect(invalid.status).toBe(400);
});

test('updates a device and reports a missing one', async ({ testApp }) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const listed = await admin.fetch('/equipment?status=available');
  const listBody = (await listed.json()) as EquipmentBody;
  const target = listBody.data.find((row) => row.code === 'EQ-0001');
  expect(target).toBeDefined();

  const updated = await admin.fetch(
    `/equipment/${target?.id}`,
    jsonWrite('PATCH', {
      code: 'EQ-0001',
      name: 'Dell Latitude 5440',
      status: 'borrowed',
      notes: null,
    }),
  );
  expect(updated.status).toBe(200);
  expect(((await updated.json()) as EquipmentBody).data.status).toBe(
    'borrowed',
  );

  const missing = await admin.fetch(
    '/equipment/999999',
    jsonWrite('PATCH', {
      code: 'EQ-NONE',
      name: 'Missing',
      status: 'available',
      notes: null,
    }),
  );
  expect(missing.status).toBe(404);
  const error = (await missing.json()) as { error: { reason: string } };
  expect(error.error.reason).toBe('EQUIPMENT_NOT_FOUND');
});

test('declares the ledger routes in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  expect(document.paths?.['/api/equipment']?.get?.operationId).toBe(
    'listEquipment',
  );
  expect(document.paths?.['/api/equipment']?.post?.operationId).toBe(
    'createEquipment',
  );
  expect(
    document.paths?.['/api/equipment/{equipmentId}']?.patch?.operationId,
  ).toBe('updateEquipment');
});
