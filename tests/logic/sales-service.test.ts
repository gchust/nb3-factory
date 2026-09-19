// @vitest-environment node
import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import createCustomers from '../../database/main/migrations/202609190001_create_sales_customers.js';
import createContacts from '../../database/main/migrations/202609190002_create_sales_contacts.js';
import createOpportunities from '../../database/main/migrations/202609190003_create_sales_opportunities.js';
import createFollowUps from '../../database/main/migrations/202609190004_create_sales_followups.js';
import createFiles from '../../database/main/migrations/202609190005_create_sales_files.js';
import {
  SalesService,
  type SalesViewer,
} from '../../server/providers/sales.js';

const migrations = [
  createCustomers,
  createContacts,
  createOpportunities,
  createFollowUps,
  createFiles,
];

/** A minimal Authorization double: the manager id gets the administrator set. */
function authorizationDouble(): Pick<AppAuthorization, 'permissionSets'> {
  return {
    permissionSets: {
      getEffective: async ({ principal }: { principal: { id: string } }) => [
        {
          key:
            principal.id === 'manager'
              ? 'system-administrator'
              : 'sales-representative',
          grants: [],
        },
      ],
    },
  } as unknown as Pick<AppAuthorization, 'permissionSets'>;
}

describe('SalesService', () => {
  let database: DatabaseManager;
  let service: SalesService;

  const repA: SalesViewer = {
    userId: 'rep-a',
    name: 'Rep A',
    isManager: false,
  };
  const repB: SalesViewer = {
    userId: 'rep-b',
    name: 'Rep B',
    isManager: false,
  };
  const manager: SalesViewer = {
    userId: 'manager',
    name: 'Manager',
    isManager: true,
  };

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
    await connection.builder.createCollection('user', (collection) => {
      collection.string('id', { length: 64 }).primary();
      collection.string('name', { length: 255 });
      collection.string('username', { length: 255 });
    });
    const now = new Date();
    await connection.query
      .insertInto('user')
      .values([
        { id: 'rep-a', name: 'Rep A', username: 'rep-a' },
        { id: 'rep-b', name: 'Rep B', username: 'rep-b' },
        { id: 'manager', name: 'Manager', username: 'manager' },
      ])
      .execute();
    await connection.query
      .insertInto('salesCustomers')
      .values([
        {
          id: 'cust-a',
          name: 'Customer A',
          ownerId: 'rep-a',
          importance: 'normal',
          status: 'following',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'cust-b',
          name: 'Customer B',
          ownerId: 'rep-b',
          importance: 'normal',
          status: 'following',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();
    await connection.query
      .insertInto('salesOpportunities')
      .values([
        {
          id: 'opp-a',
          customerId: 'cust-a',
          name: 'Deal A',
          amount: 1000,
          stage: 'initial_contact',
          ownerId: 'rep-a',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'opp-b',
          customerId: 'cust-b',
          name: 'Deal B',
          amount: 5000,
          stage: 'won',
          closeReason: 'Signed.',
          ownerId: 'rep-b',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();
    await connection.query
      .insertInto('salesFollowUps')
      .values([
        {
          id: 'fa',
          customerId: 'cust-a',
          channel: 'phone',
          content: 'Called A',
          occurredAt: now,
          nextFollowUpAt: isoDay(-2),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'fb',
          customerId: 'cust-b',
          channel: 'email',
          content: 'Emailed B',
          occurredAt: now,
          nextFollowUpAt: isoDay(3),
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    service = new SalesService(database, authorizationDouble());
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('resolves a manager from the administrator permission set', async () => {
    await expect(
      service.buildViewer('manager', 'Manager'),
    ).resolves.toMatchObject({
      isManager: true,
    });
    await expect(service.buildViewer('rep-a', 'Rep A')).resolves.toMatchObject({
      isManager: false,
    });
  });

  it('scopes customer lists to the owner for a salesperson', async () => {
    const own = await service.listCustomers(repA, {});
    expect(own.map((row) => row.id)).toEqual(['cust-a']);

    const all = await service.listCustomers(manager, {});
    expect(all.map((row) => row.id).sort()).toEqual(['cust-a', 'cust-b']);
  });

  it('refuses to read another salesperson customer by id', async () => {
    await expect(service.getCustomer(repA, 'cust-b')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
    await expect(service.getCustomer(manager, 'cust-b')).resolves.toMatchObject(
      {
        id: 'cust-b',
      },
    );
  });

  it('keeps search and status filters inside the owner scope', async () => {
    const rows = await service.listCustomers(repA, { q: 'Customer' });
    expect(rows.map((row) => row.id)).toEqual(['cust-a']);
    const filtered = await service.listCustomers(repA, { status: 'following' });
    expect(filtered.map((row) => row.id)).toEqual(['cust-a']);
    const mismatch = await service.listCustomers(repA, { ownerId: 'rep-b' });
    expect(mismatch).toEqual([]);
  });

  it('assigns a new customer to its creator unless a manager chooses an owner', async () => {
    const created = await service.createCustomer(repA, { name: 'New A' });
    expect(created.ownerId).toBe('rep-a');

    const assigned = await service.createCustomer(manager, {
      name: 'New B',
      ownerId: 'rep-b',
    });
    expect(assigned.ownerId).toBe('rep-b');
  });

  it('only lets a manager reassign a customer and keeps opportunities in step', async () => {
    await expect(
      service.updateCustomer(repA, 'cust-a', { ownerId: 'rep-b' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });

    await service.updateCustomer(manager, 'cust-a', { ownerId: 'rep-b' });
    const opportunities = await service.listOpportunities(manager, {
      customerId: 'cust-a',
    });
    expect(opportunities[0]?.ownerId).toBe('rep-b');
    expect(await service.listCustomers(repB, {})).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'cust-a' })]),
    );
  });

  it('requires a reason when an opportunity is won or lost', async () => {
    await expect(
      service.createOpportunity(repA, {
        customerId: 'cust-a',
        name: 'Closing',
        stage: 'won',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const created = await service.createOpportunity(repA, {
      customerId: 'cust-a',
      name: 'Closing',
      stage: 'won',
      closeReason: 'Signed at list price.',
    });
    expect(created.stage).toBe('won');

    await expect(
      service.updateOpportunity(repA, 'opp-a', { stage: 'lost' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const updated = await service.updateOpportunity(repA, 'opp-a', {
      stage: 'lost',
      closeReason: 'Lost to a competitor.',
    });
    expect(updated.closeReason).toBe('Lost to a competitor.');
  });

  it('refuses to hide a follow-up under another customer opportunity', async () => {
    await expect(
      service.createFollowUp(repA, {
        customerId: 'cust-a',
        opportunityId: 'opp-b',
        content: 'Wrong link',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const created = await service.createFollowUp(repA, {
      customerId: 'cust-a',
      opportunityId: 'opp-a',
      content: 'Correct link',
      channel: 'visit',
    });
    expect(created.opportunityName).toBe('Deal A');
  });

  it('reports the dashboard inside the caller scope', async () => {
    const forRep = await service.dashboard(repA);
    expect(forRep.customerCount).toBe(1);
    expect(forRep.openOpportunityCount).toBe(1);
    expect(forRep.openOpportunityAmount).toBe(1000);
    expect(forRep.followUp.overdue).toBe(1);
    expect(
      forRep.customersNeedingFollowUp.map((row) => row.customerId),
    ).toEqual(['cust-a']);

    const forManager = await service.dashboard(manager);
    expect(forManager.customerCount).toBe(2);
    expect(forManager.followUp.upcoming).toBe(1);
  });

  it('counts a customer as overdue by their earliest pending follow-up', async () => {
    // A newer visit with a future next date must not hide an older follow-up
    // that is still pending and already overdue; the workbench has to agree
    // with the customer list, which reports the earliest pending date.
    const now = new Date();
    await database
      .query()
      .insertInto('salesFollowUps')
      .values([
        {
          id: 'fa-old',
          customerId: 'cust-a',
          channel: 'phone',
          content: 'Older visit, still pending',
          occurredAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
          nextFollowUpAt: isoDay(-3),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'fa-new',
          customerId: 'cust-a',
          channel: 'email',
          content: 'Most recent visit',
          occurredAt: now,
          nextFollowUpAt: isoDay(5),
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    const [customer] = await service.listCustomers(repA, {});
    expect(customer.nextFollowUpAt).toBe(isoDay(-3));

    const forRep = await service.dashboard(repA);
    expect(forRep.followUp).toEqual({ overdue: 1, today: 0, upcoming: 0 });
    expect(forRep.customersNeedingFollowUp).toEqual([
      {
        customerId: 'cust-a',
        customerName: 'Customer A',
        nextFollowUpAt: isoDay(-3),
        dueState: 'overdue',
      },
    ]);
  });

  it('scopes file access through the owning customer', async () => {
    const now = new Date();
    await database
      .query()
      .insertInto('salesFiles')
      .values({
        id: '11111111-1111-4111-8111-111111111111',
        disk: 'local',
        key: 'objects/file.png',
        filename: 'quote.png',
        ext: 'png',
        mimeType: 'image/png',
        size: 10,
        customerId: null,
        category: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const attached = await service.attachFile(
      repA,
      '11111111-1111-4111-8111-111111111111',
      {
        category: 'opportunity',
        opportunityId: 'opp-a',
      },
    );
    expect(attached.customerId).toBe('cust-a');
    expect(attached.opportunityId).toBe('opp-a');

    await expect(
      service.requireFile(repB, '11111111-1111-4111-8111-111111111111'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      service.requireFile(repA, '11111111-1111-4111-8111-111111111111'),
    ).resolves.toMatchObject({ customerId: 'cust-a' });

    expect(await service.listFiles(repB, { opportunityId: 'opp-a' })).toEqual(
      [],
    );
    expect(
      await service.listFiles(repA, { opportunityId: 'opp-a' }),
    ).toHaveLength(1);
  });

  it('refuses to attach a file to another customer opportunity', async () => {
    const now = new Date();
    await database
      .query()
      .insertInto('salesFiles')
      .values({
        id: '22222222-2222-4222-8222-222222222222',
        disk: 'local',
        key: 'objects/other.png',
        filename: 'other.png',
        ext: 'png',
        mimeType: 'image/png',
        size: 10,
        customerId: null,
        category: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await expect(
      service.attachFile(repA, '22222222-2222-4222-8222-222222222222', {
        category: 'opportunity',
        opportunityId: 'opp-b',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('separates follow-up attachments from opportunity documents', async () => {
    const now = new Date();
    await database
      .query()
      .insertInto('salesFiles')
      .values({
        id: '33333333-3333-4333-8333-333333333333',
        disk: 'local',
        key: 'objects/site.jpg',
        filename: 'site.jpg',
        ext: 'jpg',
        mimeType: 'image/jpeg',
        size: 10,
        customerId: null,
        category: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await service.attachFile(repA, '33333333-3333-4333-8333-333333333333', {
      category: 'followup',
      followUpId: 'fa',
    });
    expect(await service.listFiles(repA, { followUpId: 'fa' })).toHaveLength(1);
    expect(
      await service.listFiles(repA, { opportunityId: 'opp-a' }),
    ).toHaveLength(0);
  });
});

function isoDay(offset: number): string {
  const today = new Date();
  const date = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + offset,
  );
  return date.toISOString().slice(0, 10);
}
