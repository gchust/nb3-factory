// @vitest-environment node

import {
  databaseManagerToken,
  type DatabaseManager,
  type SeedContext,
} from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import salesSeed from '../../database/main/seeds/20260301000004_seed_sales.ts';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';
// Cookie-authenticated writes are refused without a trusted Origin, so the Node request helper
// needs a base URL Better Auth recognizes. Set it before the runtime resolves the auth config.
process.env.BETTER_AUTH_URL ??= 'http://localhost';
process.env.APP_PUBLIC_ORIGIN ??= 'http://localhost';

interface CustomerSummaryDto {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly contactCount: number;
  readonly opportunityCount: number;
  readonly totalAmount: number;
}

interface ContactDto {
  readonly id: number;
  readonly name: string;
  readonly contactInfo: string | null;
  readonly customerId: number;
  readonly customerName: string | null;
}

interface OpportunityDto {
  readonly id: number;
  readonly name: string;
  readonly customerId: number;
  readonly customerName: string | null;
  readonly amount: number;
  readonly stage: string;
}

interface CustomerDetailDto {
  readonly id: number;
  readonly name: string;
  readonly industry: string | null;
  readonly totalAmount: number;
  readonly contacts: readonly ContactDto[];
  readonly opportunities: readonly OpportunityDto[];
}

interface DataDto<T> {
  readonly data: T;
}

interface ErrorDto {
  readonly code: string;
  readonly message: string;
}

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const TEST_ORIGIN = 'http://localhost';

let server: StandaloneServer;
let baseUrl = '';
let cookie = '';
let tempDir = '';

beforeAll(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'nocobase-sales-api-'));
  const configFile = path.join(tempDir, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(tempDir, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );

  server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: configFile,
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });

  baseUrl = `http://localhost${server.application.publicBasePath}`;

  const signIn = await send('/api/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  if (signIn.status !== 200) {
    throw new Error(`Sign-in failed with status ${signIn.status}`);
  }
  cookie = signIn.headers
    .getSetCookie()
    .map((header) => header.split(';')[0] ?? '')
    .join('; ');
}, 180_000);

afterAll(async () => {
  await server?.close();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function send(pathname: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('origin', TEST_ORIGIN);
  if (cookie) {
    headers.set('cookie', cookie);
  }
  return Promise.resolve(
    server.fetch(new Request(`${baseUrl}${pathname}`, { ...init, headers })),
  );
}

function sendAnonymous(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('origin', TEST_ORIGIN);
  return Promise.resolve(
    server.fetch(new Request(`${baseUrl}${pathname}`, { ...init, headers })),
  );
}

function json(
  pathname: string,
  method: 'POST' | 'PATCH',
  body: Readonly<Record<string, unknown>>,
): Promise<Response> {
  return send(pathname, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as DataDto<T>;
  return payload.data;
}

async function readError(response: Response): Promise<ErrorDto> {
  return (await response.json()) as ErrorDto;
}

describe('sales api', () => {
  it('requires a signed-in session for every sales endpoint', async () => {
    expect((await sendAnonymous('/api/customers')).status).toBe(401);
    expect((await sendAnonymous('/api/contacts')).status).toBe(401);
    expect((await sendAnonymous('/api/opportunities')).status).toBe(401);
  });

  it('lists the seeded customers, contacts and opportunities', async () => {
    const customers = await readData<CustomerSummaryDto[]>(
      await send('/api/customers'),
    );
    expect(customers.map((customer) => customer.name)).toEqual([
      'Blue Harbor Logistics',
      'Northwind Traders',
    ]);

    const contacts = await readData<ContactDto[]>(await send('/api/contacts'));
    expect(contacts).toHaveLength(3);

    const opportunities = await readData<OpportunityDto[]>(
      await send('/api/opportunities'),
    );
    expect(opportunities).toHaveLength(3);
  });

  it('scopes the customer total to that customer alone', async () => {
    const northwind = await readData<CustomerDetailDto>(
      await send('/api/customers/1'),
    );
    expect(northwind.contacts).toHaveLength(2);
    expect(northwind.opportunities).toHaveLength(2);

    const ownSum = northwind.opportunities.reduce(
      (sum, opportunity) => sum + opportunity.amount,
      0,
    );
    expect(northwind.totalAmount).toBe(ownSum);
    expect(northwind.totalAmount).toBe(60_000);
    // Blue Harbor's 9,500 must never appear in Northwind's total.
    expect(northwind.totalAmount).not.toBe(69_500);

    const blueHarbor = await readData<CustomerDetailDto>(
      await send('/api/customers/2'),
    );
    expect(blueHarbor.totalAmount).toBe(9_500);
  });

  it('filters opportunities by stage and by customer', async () => {
    for (const stage of ['in-progress', 'won', 'lost']) {
      const rows = await readData<OpportunityDto[]>(
        await send(`/api/opportunities?stage=${stage}`),
      );
      expect(rows.map((row) => row.stage)).toEqual([stage]);
    }

    const wonForNorthwind = await readData<OpportunityDto[]>(
      await send('/api/opportunities?customerId=1&stage=won'),
    );
    expect(wonForNorthwind.map((row) => row.name)).toEqual([
      'Warehouse expansion',
    ]);

    const invalid = await send('/api/opportunities?stage=pending');
    expect(invalid.status).toBe(400);
    expect((await readError(invalid)).code).toBe('INVALID_STAGE');
  });

  it('rejects a negative amount and an unknown stage', async () => {
    const negative = await json('/api/opportunities', 'POST', {
      name: 'Negative amount',
      customerId: 1,
      amount: -1,
      stage: 'in-progress',
    });
    expect(negative.status).toBe(400);
    expect((await readError(negative)).code).toBe('AMOUNT_NEGATIVE');

    const unknownStage = await json('/api/opportunities', 'POST', {
      name: 'Unknown stage',
      customerId: 1,
      amount: 10,
      stage: 'pending',
    });
    expect(unknownStage.status).toBe(400);
    expect((await readError(unknownStage)).code).toBe('INVALID_STAGE');

    const rows = await readData<OpportunityDto[]>(
      await send('/api/opportunities'),
    );
    expect(rows.find((row) => row.name === 'Negative amount')).toBeUndefined();
    expect(rows.find((row) => row.name === 'Unknown stage')).toBeUndefined();
  });

  it('creates and edits a customer, its contacts and its opportunities', async () => {
    const created = await json('/api/customers', 'POST', {
      name: 'Temp Test Co',
      industry: 'Testing',
    });
    expect(created.status).toBe(201);
    const customer = await readData<CustomerSummaryDto>(created);
    expect(customer.totalAmount).toBe(0);

    const customerId = customer.id;

    const first = await json('/api/opportunities', 'POST', {
      name: 'Opportunity A',
      customerId,
      amount: 500,
      stage: 'in-progress',
    });
    expect(first.status).toBe(201);
    const firstOpportunity = await readData<OpportunityDto>(first);

    const second = await json('/api/opportunities', 'POST', {
      name: 'Opportunity B',
      customerId,
      amount: 250.5,
      stage: 'won',
    });
    expect(second.status).toBe(201);

    const withOpportunities = await readData<CustomerDetailDto>(
      await send(`/api/customers/${customerId}`),
    );
    expect(withOpportunities.opportunities).toHaveLength(2);
    expect(withOpportunities.totalAmount).toBe(750.5);

    const contact = await json('/api/contacts', 'POST', {
      name: 'Temp Contact',
      contactInfo: 'temp@example.com',
      customerId,
    });
    expect(contact.status).toBe(201);

    const withContact = await readData<CustomerDetailDto>(
      await send(`/api/customers/${customerId}`),
    );
    expect(withContact.contacts).toHaveLength(1);
    expect(withContact.contacts[0]?.customerName).toBe('Temp Test Co');

    // Editing an amount moves the customer total with it.
    const patched = await json(
      `/api/opportunities/${firstOpportunity.id}`,
      'PATCH',
      { amount: 100 },
    );
    expect(patched.status).toBe(200);
    expect((await readData<OpportunityDto>(patched)).amount).toBe(100);
    const afterEdit = await readData<CustomerDetailDto>(
      await send(`/api/customers/${customerId}`),
    );
    expect(afterEdit.totalAmount).toBe(350.5);

    const wonHere = await readData<OpportunityDto[]>(
      await send(`/api/opportunities?customerId=${customerId}&stage=won`),
    );
    expect(wonHere.map((row) => row.name)).toEqual(['Opportunity B']);

    // A rejected amount leaves the stored total untouched.
    const rejected = await json(
      `/api/opportunities/${firstOpportunity.id}`,
      'PATCH',
      { amount: -5 },
    );
    expect(rejected.status).toBe(400);
    expect((await readError(rejected)).code).toBe('AMOUNT_NEGATIVE');
    const stillThere = await readData<CustomerDetailDto>(
      await send(`/api/customers/${customerId}`),
    );
    expect(stillThere.totalAmount).toBe(350.5);

    const renamed = await json(`/api/customers/${customerId}`, 'PATCH', {
      name: 'Temp Test Co Renamed',
    });
    expect(renamed.status).toBe(200);
    expect((await readData<CustomerSummaryDto>(renamed)).name).toBe(
      'Temp Test Co Renamed',
    );
  });

  it('answers 404 for a missing record and 400 for an unusable id', async () => {
    const missingCustomer = await send('/api/customers/999999');
    expect(missingCustomer.status).toBe(404);
    expect((await readError(missingCustomer)).code).toBe('CUSTOMER_NOT_FOUND');

    const missingContact = await json('/api/contacts/999999', 'PATCH', {
      name: 'Nobody',
    });
    expect(missingContact.status).toBe(404);
    expect((await readError(missingContact)).code).toBe('CONTACT_NOT_FOUND');

    const missingOpportunity = await json(
      '/api/opportunities/999999',
      'PATCH',
      { amount: 1 },
    );
    expect(missingOpportunity.status).toBe(404);
    expect((await readError(missingOpportunity)).code).toBe(
      'OPPORTUNITY_NOT_FOUND',
    );

    const badId = await send('/api/customers/abc');
    expect(badId.status).toBe(400);
    expect((await readError(badId)).code).toBe('VALIDATION_ERROR');
  });

  it('created the sales tables and their constraints through the migrations', async () => {
    const database = server.application.container.resolve(
      databaseManagerToken,
    ) as DatabaseManager;
    const connection = database.connection('main');

    const opportunities =
      await connection.schemaInspector.getPhysicalCollection({
        tableName: 'opportunities',
      });
    expect(opportunities).toBeDefined();
    const opportunityColumns = new Map(
      (opportunities?.columns ?? []).map((column) => [
        column.columnName,
        column,
      ]),
    );
    expect(opportunityColumns.get('name')?.nullable).toBe(false);
    // Collection fields are camelCase; the builder writes snake_case physical columns.
    expect(opportunityColumns.get('customer_id')?.nullable).toBe(false);
    expect(opportunityColumns.get('amount')?.nullable).toBe(false);
    expect(opportunityColumns.get('stage')?.nullable).toBe(false);

    const opportunityCustomerKey = (opportunities?.foreignKeys ?? []).find(
      (key) => key.columns.includes('customer_id'),
    );
    expect(opportunityCustomerKey?.referencedCollection.tableName).toBe(
      'customers',
    );
    expect(opportunityCustomerKey?.onDelete).toBe('cascade');
    // A name is required but not unique: a repeated name is a legitimate record.
    expect(opportunities?.uniqueConstraints).toHaveLength(0);
    expect(
      (opportunities?.indexes ?? []).some((index) =>
        index.keys.some((key) => key.columnName === 'stage'),
      ),
    ).toBe(true);

    const contacts = await connection.schemaInspector.getPhysicalCollection({
      tableName: 'contacts',
    });
    expect(contacts).toBeDefined();
    expect(
      (contacts?.foreignKeys ?? []).some(
        (key) =>
          key.columns.includes('customer_id') &&
          key.referencedCollection.tableName === 'customers',
      ),
    ).toBe(true);
    expect(contacts?.uniqueConstraints).toHaveLength(0);

    const customers = await connection.schemaInspector.getPhysicalCollection({
      tableName: 'customers',
    });
    expect(
      customers?.uniqueConstraints.map((constraint) => constraint.columns),
    ).not.toContainEqual(['name']);
  });

  it('is a no-op when the seed runs again over existing data', async () => {
    const database = server.application.container.resolve(
      databaseManagerToken,
    ) as DatabaseManager;
    const count = async (collection: string): Promise<number> =>
      (await database.repository(collection).findMany()).length;

    const before = {
      customers: await count('customers'),
      contacts: await count('contacts'),
      opportunities: await count('opportunities'),
    };

    const context = {
      repository: (collection: string) => database.repository(collection),
    } as unknown as SeedContext;

    await salesSeed.run(context);
    await salesSeed.run(context);

    const after = {
      customers: await count('customers'),
      contacts: await count('contacts'),
      opportunities: await count('opportunities'),
    };
    expect(after).toEqual(before);
  });
});
