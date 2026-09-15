import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization';
import type { ServerFileRepository } from '@nocobase/app-plugin-file/server';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SUPPORT_ATTACHMENT_COLLECTION,
  SUPPORT_TICKET_COLLECTION,
} from '../server/providers/support/constants.js';
import { SupportService } from '../server/providers/support/service.js';

let database: DatabaseManager;

const files = {
  uploadOne: () => Promise.reject(new Error('not used in this test')),
} as unknown as ServerFileRepository;

function conditions(
  collection: string,
  filter: DatabaseAuthorizationConditions['filter'],
  action = 'read',
): DatabaseAuthorizationConditions {
  return {
    type: 'database',
    collection,
    action,
    filter,
    fields: { input: '*', output: '*' },
  };
}

const ownedBy = (customerId: string) => ({
  $and: [{ customerId: { $eq: customerId } }],
});
const allRecords: DatabaseAuthorizationConditions['filter'] = { $and: [] };

beforeAll(async () => {
  database = createDatabaseManager({
    default: 'main',
    metadataStore: new InMemoryCollectionMetadataStore(),
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
  });
  await database.connect('main');

  await database
    .builder('main')
    .createCollection('support_tickets', (collection) => {
      collection.increments('id');
      collection.string('number', { length: 32 }).notNull();
      collection.string('customerId', { length: 255 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').nullable();
      collection.string('priority', { length: 16 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('assigneeId', { length: 255 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

  await database
    .builder('main')
    .createCollection('support_attachments', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.integer('ticketId').nullable();
      collection.string('customerId', { length: 255 }).nullable();
      collection.string('uploadedById', { length: 255 }).nullable();
      collection.string('uploaderRole', { length: 16 }).nullable();
    });

  await database.builder('main').createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).primary().notNull();
    collection.string('name', { length: 255 }).nullable();
    collection.string('username', { length: 255 }).nullable();
    collection.string('email', { length: 255 }).nullable();
  });

  const now = new Date();
  await database
    .query()
    .insertInto('user')
    .values([
      {
        id: 'alice',
        name: 'Alice',
        username: 'alice',
        email: 'alice@example.com',
      },
      { id: 'bob', name: 'Bob', username: 'bob', email: 'bob@example.com' },
      {
        id: 'agent-1',
        name: 'Agent One',
        username: 'agent',
        email: 'a@example.com',
      },
    ])
    .execute();
  await database
    .query()
    .insertInto('support_tickets')
    .values([
      {
        number: 'ST-000001',
        customerId: 'alice',
        title: 'Alice printer broken',
        description: null,
        priority: 'high',
        status: 'new',
        assigneeId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        number: 'ST-000002',
        customerId: 'bob',
        title: 'Bob cannot log in',
        description: null,
        priority: 'low',
        status: 'in_progress',
        assigneeId: 'agent-1',
        createdAt: now,
        updatedAt: now,
      },
    ])
    .execute();
  await database
    .query()
    .insertInto('support_attachments')
    .values([
      {
        id: '11111111-1111-1111-1111-111111111111',
        disk: 'local',
        key: 'objects/alice.png',
        filename: 'alice.png',
        ext: 'png',
        mimeType: 'image/png',
        size: 3,
        createdAt: now,
        updatedAt: now,
        ticketId: 1,
        customerId: 'alice',
        uploadedById: 'alice',
        uploaderRole: 'customer',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        disk: 'local',
        key: 'objects/bob.log',
        filename: 'bob.log',
        ext: 'log',
        mimeType: 'text/plain',
        size: 5,
        createdAt: now,
        updatedAt: now,
        ticketId: 2,
        customerId: 'bob',
        uploadedById: 'agent-1',
        uploaderRole: 'agent',
      },
    ])
    .execute();
});

afterAll(async () => {
  await database.destroy();
});

describe('SupportService ticket visibility', () => {
  it('creates a ticket with a readable sequential number', async () => {
    const service = new SupportService({ database, files });
    const ticket = await service.createTicket(
      { title: 'New issue', description: 'details', priority: 'medium' },
      'alice',
    );
    expect(ticket.number).toBe('ST-000003');
    expect(ticket.status).toBe('new');
    expect(ticket.customerId).toBe('alice');
    expect(ticket.customerName).toBe('Alice');
  });

  it('returns only the records the authorization filter allows', async () => {
    const service = new SupportService({ database, files });
    const tickets = await service.listTickets(
      conditions(SUPPORT_TICKET_COLLECTION, ownedBy('alice')),
    );
    expect(tickets.every((ticket) => ticket.customerId === 'alice')).toBe(true);
    expect(tickets.some((ticket) => ticket.customerId === 'bob')).toBe(false);
  });

  it('returns every ticket for an all-records filter', async () => {
    const service = new SupportService({ database, files });
    const tickets = await service.listTickets(
      conditions(SUPPORT_TICKET_COLLECTION, allRecords),
    );
    expect(tickets.length).toBeGreaterThanOrEqual(3);
  });

  it('cannot read a ticket outside its own record filter', async () => {
    const service = new SupportService({ database, files });
    const aliceTicket = await service.findTicket(
      1,
      conditions(SUPPORT_TICKET_COLLECTION, allRecords),
    );
    expect(aliceTicket?.customerId).toBe('alice');

    const denied = await service.findTicket(
      1,
      conditions(SUPPORT_TICKET_COLLECTION, ownedBy('bob')),
    );
    expect(denied).toBeNull();
  });

  it('cannot update a ticket outside its own record filter', async () => {
    const service = new SupportService({ database, files });
    const updated = await service.updateTicketStatus(
      1,
      { status: 'closed' },
      conditions(SUPPORT_TICKET_COLLECTION, ownedBy('bob'), 'update'),
    );
    expect(updated).toBe(0);
    const unchanged = await service.findTicket(
      1,
      conditions(SUPPORT_TICKET_COLLECTION, allRecords),
    );
    expect(unchanged?.status).toBe('new');
  });

  it('updates a ticket inside its own record filter', async () => {
    const service = new SupportService({ database, files });
    const updated = await service.updateTicketStatus(
      1,
      { status: 'in_progress', assigneeId: 'agent-1' },
      conditions(SUPPORT_TICKET_COLLECTION, ownedBy('alice'), 'update'),
    );
    expect(updated).toBe(1);
    const ticket = await service.findTicket(
      1,
      conditions(SUPPORT_TICKET_COLLECTION, allRecords),
    );
    expect(ticket?.status).toBe('in_progress');
    expect(ticket?.assigneeName).toBe('Agent One');
  });

  it('lists attachments only for the ticket the filter allows', async () => {
    const service = new SupportService({ database, files });
    const visible = await service.listAttachments(
      2,
      conditions(SUPPORT_ATTACHMENT_COLLECTION, ownedBy('bob')),
    );
    expect(visible).toHaveLength(1);
    expect(visible[0]?.uploaderRole).toBe('agent');

    const hidden = await service.listAttachments(
      2,
      conditions(SUPPORT_ATTACHMENT_COLLECTION, ownedBy('alice')),
    );
    expect(hidden).toHaveLength(0);
  });

  it('cannot resolve another customer attachment for download', async () => {
    const service = new SupportService({ database, files });
    const allowed = await service.findAttachment(
      '11111111-1111-1111-1111-111111111111',
      conditions(SUPPORT_ATTACHMENT_COLLECTION, ownedBy('alice')),
    );
    expect(allowed?.filename).toBe('alice.png');

    const denied = await service.findAttachment(
      '11111111-1111-1111-1111-111111111111',
      conditions(SUPPORT_ATTACHMENT_COLLECTION, ownedBy('bob')),
    );
    expect(denied).toBeNull();
  });

  it('never returns an attachment to a filter that matches no rows', async () => {
    const service = new SupportService({ database, files });
    const denied = await service.findAttachment(
      '11111111-1111-1111-1111-111111111111',
      conditions(SUPPORT_ATTACHMENT_COLLECTION, {
        $and: [{ customerId: { $in: [] } }],
      }),
    );
    expect(denied).toBeNull();
  });

  it('counts tickets by status and priority', async () => {
    const service = new SupportService({ database, files });
    const stats = await service.stats();
    expect(stats.total).toBe(3);
    expect(
      stats.byStatus.find((entry) => entry.key === 'in_progress')?.count,
    ).toBe(2);
    expect(stats.byStatus.find((entry) => entry.key === 'new')?.count).toBe(1);
    expect(stats.byPriority.find((entry) => entry.key === 'high')?.count).toBe(
      1,
    );
  });
});
