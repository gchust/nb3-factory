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
import type { DatabaseConnection, SeedContext } from '@nocobase/db';
import { expect } from 'vitest';

import salesSeed from '../../database/main/seeds/202601010002_sales_sample_data.js';
import { createStandaloneServer } from '../../server/standalone.ts';

// A session cookie is signed with this, and the application refuses to start without a long enough value.
process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

/** The origin the application is addressed as, and the one a cookie-bearing write must carry. */
const TEST_ORIGIN = 'http://localhost';

/**
 * The sales API as a signed-in member of the team meets it: the sample data a fresh install has, the permissions on
 * every endpoint, the customer aggregate, the stage filter, and a change to an amount showing up in that customer's
 * total and nowhere else.
 */
const test = createAppTest({
  createServer: createStandaloneServer,
  // A cookie-bearing write is refused unless its origin is the application's own, and the application's is only
  // known from configuration. The browser sends this origin; the tests do too.
  config: { app: { publicOrigin: TEST_ORIGIN } },
});

interface ApiErrorPayload {
  readonly error: {
    readonly status: string;
    readonly reason: string;
    readonly fieldViolations?: readonly { readonly field: string }[];
  };
}

interface ListBody<TRecord> {
  readonly data: TRecord[];
  readonly meta: {
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  };
}

interface CustomerRow {
  readonly id: string;
  readonly name: string;
  readonly industry: string | null;
}

interface ContactRow {
  readonly id: string;
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: string;
  readonly customerName: string;
}

interface OpportunityRow {
  readonly id: string;
  readonly name: string | null;
  readonly customerId: string;
  readonly customerName: string;
  readonly amount: number | null;
  readonly stage: 'following' | 'won' | 'lost';
}

interface CustomerDetailRow extends CustomerRow {
  readonly contacts: ContactRow[];
  readonly opportunities: OpportunityRow[];
  readonly opportunityTotal: number;
}

/** Reads a JSON body, failing with the raw text when the response is not JSON. */
async function body<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON, got ${response.status}: ${text}`);
  }
}

/**
 * A write as the signed-in user, addressed to the application's own origin. A cookie-bearing write is refused with
 * `403 INVALID_CSRF_ORIGIN` unless its origin is the application's, so every write in these tests sends one.
 */
function write(
  session: { fetch(path: string, init?: RequestInit): Promise<Response> },
  path: string,
  method: 'POST' | 'PATCH',
  payload: unknown,
): Promise<Response> {
  return session.fetch(path, {
    method,
    headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
    body: JSON.stringify(payload),
  });
}

/** The stable reason of a failed `/api` response. */
async function reason(response: Response): Promise<string> {
  return (await body<ApiErrorPayload>(response)).error.reason;
}

test('installs the sample data a fresh application starts from', async ({
  testApp,
}) => {
  const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const customers = await body<ListBody<CustomerRow>>(
    await session.fetch('/customers?pageSize=100'),
  );
  expect(customers.meta.total).toBe(2);
  expect(customers.data.map((row) => row.name).sort()).toEqual([
    'Acme Corporation',
    'Globex Industries',
  ]);
  expect(
    customers.data.map((row) => row.id).every((id) => typeof id === 'string'),
  ).toBe(true);

  const contacts = await body<ListBody<ContactRow>>(
    await session.fetch('/contacts?pageSize=100'),
  );
  expect(contacts.meta.total).toBe(3);
  // Every contact answers with the name of the customer it belongs to, so a list needs no second request.
  expect(contacts.data.every((row) => row.customerName.length > 0)).toBe(true);

  const opportunities = await body<ListBody<OpportunityRow>>(
    await session.fetch('/opportunities?pageSize=100'),
  );
  expect(opportunities.meta.total).toBe(3);
  expect(opportunities.data.map((row) => row.stage).sort()).toEqual([
    'following',
    'lost',
    'won',
  ]);
});

test('answers an unauthenticated request to every sales endpoint with 401', async ({
  request,
}) => {
  const endpoints = [
    ['GET', '/customers'],
    ['POST', '/customers'],
    ['GET', '/customers/1'],
    ['PATCH', '/customers/1'],
    ['GET', '/contacts'],
    ['POST', '/contacts'],
    ['GET', '/contacts/1'],
    ['PATCH', '/contacts/1'],
    ['GET', '/opportunities'],
    ['POST', '/opportunities'],
    ['GET', '/opportunities/1'],
    ['PATCH', '/opportunities/1'],
  ] as const;

  for (const [method, path] of endpoints) {
    const response = await request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify({}),
    });
    expect(response.status, `${method} ${path}`).toBe(401);
  }
});

test('serves a customer with its own contacts, opportunities and total', async ({
  testApp,
}) => {
  const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const customers = await body<ListBody<CustomerRow>>(
    await session.fetch('/customers?pageSize=100'),
  );
  const acme = customers.data.find((row) => row.name === 'Acme Corporation');
  const globex = customers.data.find((row) => row.name === 'Globex Industries');
  expect(acme).toBeDefined();
  expect(globex).toBeDefined();

  const detail = await body<{ data: CustomerDetailRow }>(
    await session.fetch(`/customers/${acme?.id}`),
  );
  expect(detail.data.name).toBe('Acme Corporation');
  expect(detail.data.contacts.map((row) => row.name)).toEqual(['Alice Brown']);
  expect(detail.data.opportunities.map((row) => row.name).sort()).toEqual([
    'Acme expansion',
    'Acme renewal',
  ]);
  // 120000 + 48000 = 168000, and the Globex opportunity is not counted.
  expect(detail.data.opportunityTotal).toBe(168000);

  const other = await body<{ data: CustomerDetailRow }>(
    await session.fetch(`/customers/${globex?.id}`),
  );
  expect(other.data.opportunities).toHaveLength(1);
  expect(other.data.opportunityTotal).toBe(26000);
});

test('filters the opportunity list by stage', async ({ testApp }) => {
  const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const won = await body<ListBody<OpportunityRow>>(
    await session.fetch('/opportunities?stage=won&pageSize=100'),
  );
  expect(won.meta.total).toBe(1);
  expect(won.data[0]?.name).toBe('Acme expansion');

  const lost = await body<ListBody<OpportunityRow>>(
    await session.fetch('/opportunities?stage=lost&pageSize=100'),
  );
  expect(lost.meta.total).toBe(1);
  expect(lost.data[0]?.name).toBe('Globex pilot');

  // The filter is scoped to the customer as well, so a customer list can be narrowed to one stage.
  const followed = await body<ListBody<OpportunityRow>>(
    await session.fetch('/opportunities?stage=following&pageSize=100'),
  );
  expect(followed.meta.total).toBe(1);
  expect(followed.data[0]?.name).toBe('Acme renewal');
});

test('counts an opportunity amount change in its own customer total only', async ({
  testApp,
}) => {
  const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const customers = await body<ListBody<CustomerRow>>(
    await session.fetch('/customers?pageSize=100'),
  );
  const globex = customers.data.find((row) => row.name === 'Globex Industries');
  expect(globex).toBeDefined();

  const created = await write(session, '/opportunities', 'POST', {
    name: 'Globex renewal',
    customerId: globex?.id,
    amount: 40000,
    stage: 'following',
  });
  expect(created.status).toBe(200);
  const opportunity = await body<{ data: OpportunityRow }>(created);
  expect(opportunity.data.amount).toBe(40000);

  const updated = await write(
    session,
    `/opportunities/${opportunity.data.id}`,
    'PATCH',
    { amount: 41500.5, stage: 'won' },
  );
  expect(updated.status).toBe(200);
  expect((await body<{ data: OpportunityRow }>(updated)).data.amount).toBe(
    41500.5,
  );

  // Globex now holds 26000 (lost pilot) + 41500.5, and Acme is untouched at 168000.
  const globexDetail = await body<{ data: CustomerDetailRow }>(
    await session.fetch(`/customers/${globex?.id}`),
  );
  expect(globexDetail.data.opportunityTotal).toBe(67500.5);

  const acme = customers.data.find((row) => row.name === 'Acme Corporation');
  const acmeDetail = await body<{ data: CustomerDetailRow }>(
    await session.fetch(`/customers/${acme?.id}`),
  );
  expect(acmeDetail.data.opportunityTotal).toBe(168000);
});

test('rejects invalid writes and unknown records with a stable reason', async ({
  testApp,
}) => {
  const session = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const customers = await body<ListBody<CustomerRow>>(
    await session.fetch('/customers?pageSize=100'),
  );
  const acme = customers.data.find((row) => row.name === 'Acme Corporation');

  const negative = await write(session, '/opportunities', 'POST', {
    customerId: acme?.id,
    amount: -1,
  });
  expect(negative.status).toBe(400);

  const unnamed = await write(session, '/customers', 'POST', { name: '   ' });
  expect(unnamed.status).toBe(400);

  const duplicate = await write(session, '/customers', 'POST', {
    name: 'Acme Corporation',
  });
  expect(duplicate.status).toBe(409);
  expect(await reason(duplicate)).toBe('CUSTOMER_NAME_TAKEN');

  const orphan = await write(session, '/contacts', 'POST', {
    name: 'Nobody',
    customerId: '999999',
  });
  expect(orphan.status).toBe(400);
  // The failure names the field at fault, so the form can put the message under the customer picker.
  const orphanError = await body<ApiErrorPayload>(orphan);
  expect(orphanError.error.reason).toBe('SALES_REFERENCE_NOT_FOUND');
  expect(
    orphanError.error.fieldViolations?.map((violation) => violation.field),
  ).toEqual(['customerId']);

  const missing = await session.fetch('/customers/999999');
  expect(missing.status).toBe(404);
  expect(await reason(missing)).toBe('CUSTOMER_NOT_FOUND');

  const missingOpportunity = await write(
    session,
    '/opportunities/999999',
    'PATCH',
    { amount: 1 },
  );
  expect(missingOpportunity.status).toBe(404);
  expect(await reason(missingOpportunity)).toBe('OPPORTUNITY_NOT_FOUND');

  const missingContact = await session.fetch('/contacts/999999');
  expect(missingContact.status).toBe(404);
  expect(await reason(missingContact)).toBe('CONTACT_NOT_FOUND');
});

test('declares every route in the API document', async ({ testApp }) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);
  const document = await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  expect(document.paths?.['/api/customers']?.get?.operationId).toBe(
    'listCustomers',
  );
  expect(document.paths?.['/api/customers/{id}']?.get?.operationId).toBe(
    'getCustomer',
  );
  expect(document.paths?.['/api/opportunities/{id}']?.patch?.operationId).toBe(
    'updateOpportunity',
  );
});

test('running the sample seed again changes nothing', async ({ testApp }) => {
  const connection = testApp.database.connection();
  const counts = async (): Promise<Record<string, number>> => ({
    customers: await listCount(connection, 'customers'),
    contacts: await listCount(connection, 'contacts'),
    opportunities: await listCount(connection, 'opportunities'),
  });

  const before = await counts();
  // The seeder builds this context; the seed writes only through `repository`, so this is what an execution sees.
  const context = {
    repository: (collection: string) => connection.repository(collection),
  } as unknown as SeedContext;
  await salesSeed.run(context);
  await salesSeed.run(context);

  expect(await counts()).toEqual(before);
});

/** Number of rows in a seeded collection, through the same repository the seed writes with. */
async function listCount(
  connection: DatabaseConnection,
  collection: string,
): Promise<number> {
  return connection.repository(collection).count();
}
