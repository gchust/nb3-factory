import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import createAttachments from '../database/main/migrations/202609140002_create_support_attachments.js';
import createTickets from '../database/main/migrations/202609140001_create_support_tickets.js';
import issuerDefault from '../database/main/migrations/202609140003_default_credential_account_issuer.js';

interface SqliteClient {
  raw(sql: string): Promise<Record<string, unknown>[]>;
}

let database: DatabaseManager;
let connection: DatabaseConnection;
let client: SqliteClient;

async function columnsOf(table: string): Promise<Record<string, unknown>[]> {
  return client.raw(`pragma table_info(${table})`);
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await client.raw(
    `select name from sqlite_master where type='table' and name='${table}'`,
  );
  return rows.length > 0;
}

function contextFor(): { builder: DatabaseManager['builder'] } {
  return { builder: database.builder('main') } as never;
}

beforeEach(async () => {
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
  connection = await database.connect('main');
  client = await connection.client<SqliteClient>();
});

afterEach(async () => {
  await database.destroy();
});

describe('support ticket migrations', () => {
  it('creates and drops the ticket and attachment tables', async () => {
    await createTickets.up(contextFor());
    await createAttachments.up(contextFor());

    expect(await tableExists('support_tickets')).toBe(true);
    expect(await tableExists('support_attachments')).toBe(true);

    const ticketColumns = (await columnsOf('support_tickets')).map((column) =>
      String(column.name),
    );
    for (const name of [
      'id',
      'number',
      'customer_id',
      'title',
      'description',
      'priority',
      'status',
      'assignee_id',
      'created_at',
      'updated_at',
    ]) {
      expect(ticketColumns).toContain(name);
    }

    const attachmentColumns = (await columnsOf('support_attachments')).map(
      (column) => String(column.name),
    );
    for (const name of [
      'id',
      'disk',
      'key',
      'filename',
      'ext',
      'mime_type',
      'size',
      'created_at',
      'updated_at',
      'ticket_id',
      'customer_id',
      'uploaded_by_id',
      'uploader_role',
    ]) {
      expect(attachmentColumns).toContain(name);
    }

    // The file repository needs exactly one primary key, on `id`.
    const attachmentInfo = await columnsOf('support_attachments');
    expect(attachmentInfo.filter((column) => column.pk === 1)).toHaveLength(1);

    await createAttachments.down(contextFor());
    await createTickets.down(contextFor());
    expect(await tableExists('support_attachments')).toBe(false);
    expect(await tableExists('support_tickets')).toBe(false);
  });
});

describe('credential account issuer migration', () => {
  it('lets a credential account be inserted and reverts on down', async () => {
    await database.builder('main').createCollection('account', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issuer', { length: 255 }).notNull();
      collection.string('accountId', { length: 320 }).notNull();
      collection.string('providerId', { length: 128 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
      collection.unique(['issuer', 'accountId']);
    });

    const insertWithoutIssuer = (id: string) =>
      connection.query
        .insertInto('account')
        .values({
          id,
          accountId: id,
          providerId: 'credential',
          userId: id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();

    await expect(
      connection.query
        .selectFrom('account')
        .select('id')
        .where('id', '=', 'never')
        .execute(),
    ).resolves.toEqual([]);

    await expect(insertWithoutIssuer('before')).rejects.toThrow();

    await issuerDefault.up(contextFor());
    await insertWithoutIssuer('after');
    const inserted = await connection.query
      .selectFrom('account')
      .select(['id', 'issuer'])
      .where('id', '=', 'after')
      .executeTakeFirst();
    expect(inserted?.issuer).toBe('local:credential');

    await issuerDefault.down(contextFor());
    await expect(insertWithoutIssuer('reverted')).rejects.toThrow();
  });
});
