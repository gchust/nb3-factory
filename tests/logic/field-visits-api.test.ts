// @vitest-environment node
import { rmSync } from 'node:fs';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { afterEach, describe, expect, it } from 'vitest';

import { fieldVisitApiRoutes } from '../../server/routes/field-visits.js';
import type { FieldVisit } from '../../client/pages/field-visits/api.js';
import {
  fieldVisitServiceToken,
  type FieldVisitService,
} from '../../server/providers/field-visits.js';
import { createFieldVisitsTestDatabase } from '../fixtures/field-visits-database.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function fixture() {
  const database = await createFieldVisitsTestDatabase();
  directories.push(database.directory);
  return database;
}

async function routerFor(service: FieldVisitService, authenticated: boolean) {
  const resolve = (token: unknown): unknown => {
    if (token === authenticationToken) {
      return {
        required: () => async (context: never, next: () => Promise<void>) => {
          if (!authenticated) {
            return new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), {
              status: 401,
            });
          }
          await next();
        },
      };
    }
    if (token === fieldVisitServiceToken) {
      return service;
    }
    throw new Error('Unexpected service token.');
  };

  const app = { container: { resolve } } as unknown as Application;
  return fieldVisitApiRoutes.createRouter(app);
}

function post(body: unknown, method = 'POST') {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

interface ListBody {
  readonly data: readonly FieldVisit[];
  readonly total: number;
}

interface ItemBody {
  readonly data: FieldVisit;
}

interface ErrorBody {
  readonly code: string;
  readonly issues?: readonly { field: string; code: string }[];
}

describe('field visits API', () => {
  it('requires an authenticated session', async () => {
    const database = await fixture();
    const anonymous = await routerFor(database.service, false);

    const denied = await anonymous.request('/field-visits');
    expect(denied.status).toBe(401);

    const authenticated = await routerFor(database.service, true);
    const allowed = await authenticated.request('/field-visits');
    expect(allowed.status).toBe(200);
    expect((await allowed.json()) as ListBody).toEqual({ data: [], total: 0 });

    await database.close();
  });

  it('creates records and lists them newest first', async () => {
    const database = await fixture();
    const router = await routerFor(database.service, true);

    const older = await router.request(
      '/field-visits',
      post({
        customerName: '  Blue Ocean  ',
        visitDate: '2026-09-01',
        conclusion: 'neutral',
        engineerName: '  Chen  ',
        notes: 'Needs a follow-up.',
      }),
    );
    expect(older.status).toBe(201);

    const newer = await router.request(
      '/field-visits',
      post({
        customerName: 'Acme',
        visitDate: '2026-09-10',
        conclusion: 'satisfied',
      }),
    );
    expect(newer.status).toBe(201);
    const created = ((await newer.json()) as ItemBody).data;
    expect(created.customerName).toBe('Acme');
    expect(created.engineerName).toBeNull();

    const list = await router.request('/field-visits');
    const body = (await list.json()) as ListBody;
    expect(body.total).toBe(2);
    expect(body.data.map((record) => record.visitDate)).toEqual([
      '2026-09-10',
      '2026-09-01',
    ]);
    // Values are trimmed before they are stored.
    expect(body.data[1]).toMatchObject({
      customerName: 'Blue Ocean',
      engineerName: 'Chen',
      notes: 'Needs a follow-up.',
    });

    await database.close();
  });

  it('filters the list by customer name', async () => {
    const database = await fixture();
    const router = await routerFor(database.service, true);
    for (const customerName of ['Acme', 'Northwind', 'Acme Labs']) {
      await router.request(
        '/field-visits',
        post({
          customerName,
          visitDate: '2026-09-01',
          conclusion: 'satisfied',
        }),
      );
    }

    const response = await router.request('/field-visits?search=Acme');
    const body = (await response.json()) as ListBody;
    expect(body.total).toBe(2);
    expect(body.data.map((record) => record.customerName)).toEqual([
      'Acme Labs',
      'Acme',
    ]);

    await database.close();
  });

  it('rejects a payload missing required values', async () => {
    const database = await fixture();
    const router = await routerFor(database.service, true);

    const response = await router.request('/field-visits', post({}));
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe('FIELD_VISIT_VALIDATION_FAILED');
    expect(body.issues?.map((issue) => issue.field).sort()).toEqual([
      'conclusion',
      'customerName',
      'visitDate',
    ]);

    await database.close();
  });

  it('rejects an unknown conclusion', async () => {
    const database = await fixture();
    const router = await routerFor(database.service, true);

    const response = await router.request(
      '/field-visits',
      post({
        customerName: 'Acme',
        visitDate: '2026-09-01',
        conclusion: 'maybe',
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.issues).toEqual([
      { field: 'conclusion', code: 'CONCLUSION_INVALID' },
    ]);

    await database.close();
  });

  it('updates an existing record and reports a missing one', async () => {
    const database = await fixture();
    const router = await routerFor(database.service, true);
    const created = (
      (await (
        await router.request(
          '/field-visits',
          post({
            customerName: 'Acme',
            visitDate: '2026-09-01',
            conclusion: 'neutral',
          }),
        )
      ).json()) as ItemBody
    ).data;

    const updated = await router.request(
      `/field-visits/${created.id}`,
      post(
        {
          customerName: 'Acme',
          visitDate: '2026-09-01',
          conclusion: 'satisfied',
          engineerName: 'Chen',
        },
        'PATCH',
      ),
    );
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as ItemBody).data).toMatchObject({
      conclusion: 'satisfied',
      engineerName: 'Chen',
    });

    const missing = await router.request(
      '/field-visits/9999',
      post(
        {
          customerName: 'Acme',
          visitDate: '2026-09-01',
          conclusion: 'satisfied',
        },
        'PATCH',
      ),
    );
    expect(missing.status).toBe(404);

    await database.close();
  });
});
