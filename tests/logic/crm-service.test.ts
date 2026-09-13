import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  DatabaseAuthorizationConditions,
  DatabaseFilter,
} from '@nocobase/app-plugin-authorization';
import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';
import { afterEach, describe, expect, it } from 'vitest';

import crmMigration from '../../database/main/migrations/202609130001_create_crm_tables.js';
import { CrmService } from '../../server/providers/crm/service.js';

interface TestContext {
  database: DatabaseManager;
  service: CrmService;
  dispose(): Promise<void>;
}

const contexts: TestContext[] = [];

afterEach(async () => {
  while (contexts.length > 0) {
    const context = contexts.pop();
    await context?.dispose();
  }
});

async function createContext(): Promise<TestContext> {
  const directory = mkdtempSync(join(tmpdir(), 'crm-test-'));
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: join(directory, 'test.sqlite'),
      },
    },
  });
  await crmMigration.up({
    builder: database.builder(),
    query: database.query(),
    connection: {} as MigrationContext['connection'],
  });
  const context: TestContext = {
    database,
    service: new CrmService(database),
    async dispose() {
      await database.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
  contexts.push(context);
  return context;
}

function conditions(filter: DatabaseFilter): DatabaseAuthorizationConditions {
  return {
    type: 'database',
    collection: 'main.crmCustomers',
    action: 'read',
    filter,
    fields: { input: '*', output: '*' },
  };
}

const allRecords: DatabaseFilter = { $and: [] };
const ownedBy = (ownerId: string): DatabaseFilter => ({
  $and: [{ ownerId: { $eq: ownerId } }],
});

describe('CRM migration', () => {
  it('creates every CRM table', async () => {
    const { database, dispose } = await createContext();
    const builder = database.builder();
    for (const table of [
      'crmCustomers',
      'crmContacts',
      'crmOpportunities',
      'crmFollowUps',
      'crmFiles',
      'crmAttachments',
    ]) {
      expect(await builder.hasCollection(table)).toBe(true);
    }
    await dispose();
  });

  it('reverses cleanly', async () => {
    const { database, dispose } = await createContext();
    await crmMigration.down?.({
      builder: database.builder(),
      query: database.query(),
      connection: {} as MigrationContext['connection'],
    });
    await expect(
      database.query().selectFrom('crmCustomers').selectAll().execute(),
    ).rejects.toThrow();
    await dispose();
  });
});

describe('CrmService record scope', () => {
  it('lists only the records the caller owns', async () => {
    const { service, dispose } = await createContext();
    await service.createCustomer(
      {
        name: 'Alice Co',
        industry: null,
        companySize: null,
        source: null,
        status: 'potential',
        notes: null,
      },
      'alice',
    );
    await service.createCustomer(
      {
        name: 'Bob Co',
        industry: null,
        companySize: null,
        source: null,
        status: 'potential',
        notes: null,
      },
      'bob',
    );

    const alice = await service.listCustomers(conditions(ownedBy('alice')), {});
    expect(alice.map((row) => row.name)).toEqual(['Alice Co']);

    const all = await service.listCustomers(conditions(allRecords), {});
    expect(all.map((row) => row.name).sort()).toEqual(['Alice Co', 'Bob Co']);
    await dispose();
  });

  it('cannot read or update a record outside the authorized filter', async () => {
    const { service, dispose } = await createContext();
    const id = await service.createCustomer(
      {
        name: 'Secret Co',
        industry: null,
        companySize: null,
        source: null,
        status: 'potential',
        notes: null,
      },
      'bob',
    );

    expect(
      await service.getCustomer(id, conditions(ownedBy('alice'))),
    ).toBeUndefined();
    const updated = await service.updateCustomer(
      id,
      { name: 'Hacked' },
      conditions(ownedBy('alice')),
    );
    expect(updated).toBe(0);

    const still = await service.getCustomer(id, conditions(allRecords));
    expect(still?.name).toBe('Secret Co');
    await dispose();
  });

  it('moves a customer and its children to another owner', async () => {
    const { service, dispose } = await createContext();
    const customerId = await service.createCustomer(
      {
        name: 'Moving Co',
        industry: null,
        companySize: null,
        source: null,
        status: 'potential',
        notes: null,
      },
      'alice',
    );
    const opportunityId = await service.createOpportunity(
      {
        name: 'Moving deal',
        customerId,
        amount: 100,
        stage: 'following',
        expectedCloseDate: null,
        wonAmount: null,
        lostReason: null,
      },
      'alice',
    );

    const moved = await service.reassignCustomer(
      customerId,
      'alice',
      'bob',
      conditions(allRecords),
    );
    expect(moved).toBe(1);

    expect(
      await service.getCustomer(customerId, conditions(ownedBy('alice'))),
    ).toBeUndefined();
    const forBob = await service.getOpportunity(
      opportunityId,
      conditions(ownedBy('bob')),
    );
    expect(forBob?.ownerId).toBe('bob');
    await dispose();
  });

  it('computes funnel totals for the authorized scope', async () => {
    const { service, dispose } = await createContext();
    for (const [owner, stage, amount] of [
      ['alice', 'won', 500],
      ['alice', 'lost', 100],
      ['bob', 'lead', 900],
    ] as const) {
      await service.createOpportunity(
        {
          name: `${owner}-${stage}`,
          customerId: 1,
          amount,
          stage,
          expectedCloseDate: null,
          wonAmount: stage === 'won' ? amount : null,
          lostReason: stage === 'lost' ? 'nope' : null,
        },
        owner,
      );
    }

    const stats = await service.funnel(conditions(ownedBy('alice')));
    expect(stats.totalCount).toBe(2);
    expect(stats.winRate).toBeCloseTo(0.5);
    expect(stats.totalAmount).toBe(600);
    await dispose();
  });
});
