// @vitest-environment node
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import createCustomers from '../../database/main/migrations/202609190001_create_sales_customers.js';
import createContacts from '../../database/main/migrations/202609190002_create_sales_contacts.js';
import createOpportunities from '../../database/main/migrations/202609190003_create_sales_opportunities.js';
import createFollowUps from '../../database/main/migrations/202609190004_create_sales_followups.js';
import createFiles from '../../database/main/migrations/202609190005_create_sales_files.js';
import permissionSeed from '../../database/main/seeds/202609190101_seed_sales_permission_sets.js';
import demoSeed from '../../database/main/seeds/202609190102_seed_sales_demo_data.js';
import {
  SalesService,
  dueState,
  todayDate,
  type SalesViewer,
} from '../../server/providers/sales.js';

const migrations = [
  createCustomers,
  createContacts,
  createOpportunities,
  createFollowUps,
  createFiles,
];

describe('sales seeds', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const connection = database.connection();
    for (const migration of migrations) {
      await migration.up({
        builder: connection.builder,
        query: connection.query,
        connection: connection as never,
      });
    }
    // The tables the seeds touch but do not own, as the plugins create them.
    await connection.builder.createCollection('user', (collection) => {
      collection.string('id', { length: 64 }).primary();
      collection.string('name', { length: 255 });
      collection.string('username', { length: 255 });
      collection.string('email', { length: 255 });
      collection.boolean('emailVerified');
      collection.datetime('createdAt');
      collection.datetime('updatedAt');
    });
    await connection.builder.createCollection('account', (collection) => {
      collection.string('id', { length: 64 }).primary();
      collection.string('issuer', { length: 64 });
      collection.string('accountId', { length: 64 });
      collection.string('providerId', { length: 64 });
      collection.string('userId', { length: 64 });
      collection.string('password', { length: 255 });
      collection.datetime('createdAt');
      collection.datetime('updatedAt');
    });
    await connection.builder.createCollection(
      'authorizationPermissionSets',
      (collection) => {
        collection.string('id', { length: 64 }).primary();
        collection.string('key', { length: 128 });
        collection.string('title', { length: 255 });
        collection.text('grants');
        collection.datetime('createdAt');
        collection.datetime('updatedAt');
      },
    );
    await connection.builder.createCollection(
      'authorizationPermissionSetAssignments',
      (collection) => {
        collection.string('id', { length: 255 }).primary();
        collection.string('subjectType', { length: 64 });
        collection.string('subjectId', { length: 128 });
        collection.string('permissionSetKey', { length: 128 });
        collection.datetime('createdAt');
        collection.datetime('updatedAt');
      },
    );
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function runSeeds(): Promise<void> {
    const connection = database.connection();
    await permissionSeed.run({
      query: connection.query,
      connection: connection as never,
    });
    await demoSeed.run({
      query: connection.query,
      connection: connection as never,
    });
  }

  async function count(table: string): Promise<number> {
    const rows = await database
      .query()
      .selectFrom(table)
      .select('id')
      .execute();
    return rows.length;
  }

  it('creates the roles and exactly the demo records the brief asks for', async () => {
    await runSeeds();

    const sets = await database
      .query()
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .execute();
    const keys = sets.map((row) => String(row.key));
    expect(keys).toContain('sales-manager');
    expect(keys).toContain('sales-representative');

    const assignments = await database
      .query()
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectType', 'subjectId', 'permissionSetKey'])
      .execute();
    expect(
      assignments.some(
        (row) =>
          row.subjectType === 'authenticated' &&
          row.subjectId === '*' &&
          row.permissionSetKey === 'sales-representative',
      ),
    ).toBe(true);

    expect(await count('salesCustomers')).toBe(8);
    expect(await count('salesContacts')).toBe(12);
    expect(await count('salesOpportunities')).toBe(10);
    expect(await count('salesFollowUps')).toBe(16);

    const users = await database
      .query()
      .selectFrom('user')
      .select('username')
      .execute();
    const usernames = users.map((row) => String(row.username)).sort();
    expect(usernames).toEqual(['sales.li', 'sales.zhang']);

    const owners = await database
      .query()
      .selectFrom('salesCustomers')
      .select('ownerId')
      .execute();
    expect(new Set(owners.map((row) => String(row.ownerId))).size).toBe(2);

    const stages = await database
      .query()
      .selectFrom('salesOpportunities')
      .select('stage')
      .execute();
    expect(new Set(stages.map((row) => String(row.stage))).size).toBe(6);
  });

  it('is idempotent: running both seeds again changes nothing', async () => {
    await runSeeds();
    const before = {
      customers: await count('salesCustomers'),
      contacts: await count('salesContacts'),
      opportunities: await count('salesOpportunities'),
      followUps: await count('salesFollowUps'),
      users: await count('user'),
      sets: await count('authorizationPermissionSets'),
      assignments: await count('authorizationPermissionSetAssignments'),
    };

    await runSeeds();

    expect({
      customers: await count('salesCustomers'),
      contacts: await count('salesContacts'),
      opportunities: await count('salesOpportunities'),
      followUps: await count('salesFollowUps'),
      users: await count('user'),
      sets: await count('authorizationPermissionSets'),
      assignments: await count('authorizationPermissionSetAssignments'),
    }).toEqual(before);
  });

  it('keeps the workbench follow-up counts consistent with the customer list', async () => {
    await runSeeds();
    const service = new SalesService(database, {
      permissionSets: { getEffective: async () => [] },
    } as never);
    const manager: SalesViewer = {
      userId: 'manager',
      name: 'Manager',
      isManager: true,
    };

    const customers = await service.listCustomers(manager, {});
    const dashboard = await service.dashboard(manager);
    const today = todayDate();

    // The workbench reports one follow-up state per customer; it must derive it
    // from the same earliest pending date the customer list shows, or the two
    // screens disagree about who is overdue on the same day.
    const pending = new Map<string, string>();
    for (const customer of customers) {
      const next = customer.nextFollowUpAt;
      if (next) pending.set(String(customer.id), String(next));
    }
    expect(dashboard.customerCount).toBe(customers.length);

    const expected = { overdue: 0, today: 0, upcoming: 0 };
    for (const next of pending.values()) {
      const state = dueState(next, today);
      if (state === 'overdue') expected.overdue += 1;
      if (state === 'today') expected.today += 1;
      if (state === 'upcoming') expected.upcoming += 1;
    }
    expect(dashboard.followUp).toEqual(expected);

    const expectedList = [...pending.entries()]
      .filter(([, next]) => {
        const state = dueState(next, today);
        return state === 'overdue' || state === 'today';
      })
      .map(([customerId, nextFollowUpAt]) => ({ customerId, nextFollowUpAt }))
      .sort((left, right) =>
        left.nextFollowUpAt.localeCompare(right.nextFollowUpAt),
      );
    expect(
      dashboard.customersNeedingFollowUp.map((row) => ({
        customerId: row.customerId,
        nextFollowUpAt: row.nextFollowUpAt,
      })),
    ).toEqual(expectedList);
  });
});
