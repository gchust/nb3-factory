// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  ServerFileRepositoryManager,
  serverFileRepositoryManagerToken,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import createCustomers from '../../database/main/migrations/202609190001_create_sales_customers.js';
import createContacts from '../../database/main/migrations/202609190002_create_sales_contacts.js';
import createOpportunities from '../../database/main/migrations/202609190003_create_sales_opportunities.js';
import createFollowUps from '../../database/main/migrations/202609190004_create_sales_followups.js';
import createFiles from '../../database/main/migrations/202609190005_create_sales_files.js';
import salesApiRoutes from '../../server/routes/sales.js';

const migrations = [
  createCustomers,
  createContacts,
  createOpportunities,
  createFollowUps,
  createFiles,
];

/**
 * In-memory disk so the file plugin's real upload/store path runs — key
 * generation, metadata validation and deletion — without touching a filesystem.
 */
function createFakeDrive() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const disk = {
    putStream: async (
      key: string,
      stream: AsyncIterable<Uint8Array>,
      options?: { contentType?: string },
    ) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      objects.set(key, {
        body: Buffer.concat(chunks),
        contentType: options?.contentType ?? 'application/octet-stream',
      });
    },
    getMetaData: async (key: string) => {
      const entry = objects.get(key);
      if (!entry) throw new Error(`missing object ${key}`);
      return {
        contentLength: entry.body.length,
        contentType: entry.contentType,
      };
    },
    delete: async (key: string) => {
      objects.delete(key);
    },
    exists: async (key: string) => objects.has(key),
    getStream: async (key: string) =>
      Readable.from([objects.get(key)?.body ?? Buffer.alloc(0)]),
    getVisibility: async () => 'private' as const,
    getUrl: async () => '',
    getSignedUrl: async () => '',
  };
  return {
    objects,
    // `use` is the drive manager's method name, not a React hook.
    // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
    use: () => disk,
  };
}

const testAuth = {
  required:
    () =>
    async (
      context: {
        req: { header(name: string): string | undefined };
        set(key: string, value: unknown): void;
        json(body: unknown, status: 400): Response;
      },
      next: () => Promise<void>,
    ) => {
      const userId = context.req.header('x-test-user');
      if (!userId)
        return context.json({ message: 'Authentication required.' }, 401);
      context.set('auth', {
        user: { id: userId, name: userId },
        session: { id: 's' },
      });
      await next();
      return undefined;
    },
};

function authorizationDouble() {
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
  };
}

interface FileRecord {
  id: string;
  filename: string;
  category: string | null;
  customerId: string | null;
  opportunityId: string | null;
  followUpId: string | null;
  uploadedByName: string | null;
}

describe('sales file safety', () => {
  let database: DatabaseManager;
  let router: Hono;
  let drive: ReturnType<typeof createFakeDrive>;

  const asUser = (id: string) => ({ 'x-test-user': id });

  async function upload(
    userId: string,
    fields: Record<string, string>,
    files: File[],
  ): Promise<Response> {
    const body = new FormData();
    for (const file of files) body.append('file', file);
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    return router.request('/sales/files', {
      method: 'POST',
      headers: asUser(userId),
      body,
    });
  }

  async function content(userId: string, fileId: string): Promise<Response> {
    return router.request(
      `/sales/files/${encodeURIComponent(fileId)}/content`,
      {
        headers: asUser(userId),
      },
    );
  }

  function file(name: string, type: string, content: string): File {
    return new File([Buffer.from(content)], name, { type });
  }

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
          id: 'opp-a1',
          customerId: 'cust-a',
          name: 'Deal A1',
          amount: 1000,
          stage: 'proposal',
          ownerId: 'rep-a',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'opp-a2',
          customerId: 'cust-a',
          name: 'Deal A2',
          amount: 2000,
          stage: 'negotiation',
          ownerId: 'rep-a',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();
    await connection.query
      .insertInto('salesFollowUps')
      .values([
        {
          id: 'fa1',
          customerId: 'cust-a',
          channel: 'visit',
          content: 'Site visit',
          occurredAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'fa2',
          customerId: 'cust-a',
          opportunityId: 'opp-a1',
          channel: 'phone',
          content: 'Follow-up call',
          occurredAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    drive = createFakeDrive();
    const container = new ServiceContainer();
    container.instance(authenticationToken, testAuth as never);
    container.instance(authorizationToken, authorizationDouble() as never);
    container.instance(databaseManagerToken, database as never);
    container.instance(
      serverFileRepositoryManagerToken,
      new ServerFileRepositoryManager(database, drive as never) as never,
    );
    container.instance(driveManagerToken, drive as never);
    router = await salesApiRoutes.createRouter({
      container,
      publicBasePath: '/main',
    } as unknown as Application);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('stores same-named files on two opportunities without overwriting', async () => {
    const first = await upload(
      'rep-a',
      { category: 'opportunity', opportunityId: 'opp-a1' },
      [file('quote.pdf', 'application/pdf', 'quote for A1')],
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { data: FileRecord[] };
    const firstFile = firstBody.data[0]!;

    const second = await upload(
      'rep-a',
      { category: 'opportunity', opportunityId: 'opp-a2' },
      [file('quote.pdf', 'application/pdf', 'quote for A2')],
    );
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { data: FileRecord[] };
    const secondFile = secondBody.data[0]!;

    expect(firstFile.id).not.toBe(secondFile.id);

    const rows = await database
      .query()
      .selectFrom('salesFiles')
      .select(['id', 'key'])
      .where('id', 'in', [firstFile.id, secondFile.id])
      .execute();
    const keys = rows.map((row) => String(row.key));
    expect(new Set(keys).size).toBe(2);

    const firstBytes = Buffer.from(
      await (await content('rep-a', firstFile.id)).arrayBuffer(),
    );
    const secondBytes = Buffer.from(
      await (await content('rep-a', secondFile.id)).arrayBuffer(),
    );
    expect(firstBytes.toString()).toBe('quote for A1');
    expect(secondBytes.toString()).toBe('quote for A2');

    const removal = await router.request(`/sales/files/${firstFile.id}`, {
      method: 'DELETE',
      headers: asUser('rep-a'),
    });
    expect(removal.status).toBe(204);

    const surviving = await content('rep-a', secondFile.id);
    expect(surviving.status).toBe(200);
    expect(Buffer.from(await surviving.arrayBuffer()).toString()).toBe(
      'quote for A2',
    );
  });

  it('replaces the customer avatar and removes it without touching deal files', async () => {
    const opportunityUpload = await upload(
      'rep-a',
      { category: 'opportunity', opportunityId: 'opp-a1' },
      [file('spec.pdf', 'application/pdf', 'requirement spec')],
    );
    const opportunityFile = (
      (await opportunityUpload.json()) as { data: FileRecord[] }
    ).data[0]!;
    const followUpUpload = await upload(
      'rep-a',
      { category: 'followup', followUpId: 'fa1' },
      [file('site.jpg', 'image/jpeg', 'site photo bytes')],
    );
    const followUpFile = (
      (await followUpUpload.json()) as { data: FileRecord[] }
    ).data[0]!;

    const avatarOne = await uploadAvatar('rep-a', 'logo-one.png');
    expect(avatarOne.status).toBe(201);
    const avatarOneId = ((await avatarOne.json()) as { data: FileRecord }).data
      .id;

    const avatarTwo = await uploadAvatar('rep-a', 'logo-two.png');
    expect(avatarTwo.status).toBe(201);
    const avatarTwoId = ((await avatarTwo.json()) as { data: FileRecord }).data
      .id;
    expect(avatarTwoId).not.toBe(avatarOneId);

    // The replaced image is gone, but the deal files are untouched.
    expect(
      await database
        .query()
        .selectFrom('salesFiles')
        .select('id')
        .where('id', '=', avatarOneId)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(
      Buffer.from(
        await (await content('rep-a', opportunityFile.id)).arrayBuffer(),
      ).toString(),
    ).toBe('requirement spec');
    expect(
      Buffer.from(
        await (await content('rep-a', followUpFile.id)).arrayBuffer(),
      ).toString(),
    ).toBe('site photo bytes');

    const customer = await router.request('/sales/customers/cust-a', {
      headers: asUser('rep-a'),
    });
    const detail = (await customer.json()) as {
      data: { avatarFileId: string; files: FileRecord[] };
    };
    expect(detail.data.avatarFileId).toBe(avatarTwoId);
    expect(detail.data.files).toHaveLength(3);

    const removed = await router.request('/sales/customers/cust-a/avatar', {
      method: 'DELETE',
      headers: asUser('rep-a'),
    });
    expect(removed.status).toBe(200);
    expect(
      await database
        .query()
        .selectFrom('salesFiles')
        .select('id')
        .where('id', '=', avatarTwoId)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect((await content('rep-a', opportunityFile.id)).status).toBe(200);
    expect((await content('rep-a', followUpFile.id)).status).toBe(200);
  });

  it('removes one follow-up file without breaking records still using others', async () => {
    const opportunityUpload = await upload(
      'rep-a',
      { category: 'opportunity', opportunityId: 'opp-a1' },
      [file('contract.pdf', 'application/pdf', 'contract bytes')],
    );
    const opportunityFile = (
      (await opportunityUpload.json()) as { data: FileRecord[] }
    ).data[0]!;
    const uploadOne = await upload(
      'rep-a',
      { category: 'followup', followUpId: 'fa1' },
      [file('memo.txt', 'text/plain', 'memo one')],
    );
    const memoOne = ((await uploadOne.json()) as { data: FileRecord[] })
      .data[0]!;
    const uploadTwo = await upload(
      'rep-a',
      { category: 'followup', followUpId: 'fa1' },
      [file('memo.txt', 'text/plain', 'memo two')],
    );
    const memoTwo = ((await uploadTwo.json()) as { data: FileRecord[] })
      .data[0]!;

    const removal = await router.request(`/sales/files/${memoOne.id}`, {
      method: 'DELETE',
      headers: asUser('rep-a'),
    });
    expect(removal.status).toBe(204);

    expect((await content('rep-a', memoTwo.id)).status).toBe(200);
    expect(
      Buffer.from(
        await (await content('rep-a', memoTwo.id)).arrayBuffer(),
      ).toString(),
    ).toBe('memo two');
    expect(
      Buffer.from(
        await (await content('rep-a', opportunityFile.id)).arrayBuffer(),
      ).toString(),
    ).toBe('contract bytes');
  });

  it('moves contacts, opportunities, follow-ups and files to the new owner on transfer', async () => {
    await router.request('/sales/customers/cust-a/contacts', {
      method: 'POST',
      headers: { ...asUser('rep-a'), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Primary Contact', isPrimary: true }),
    });
    const opportunityUpload = await upload(
      'rep-a',
      { category: 'opportunity', opportunityId: 'opp-a1' },
      [file('quote.pdf', 'application/pdf', 'shared quote bytes')],
    );
    const dealFile = (
      (await opportunityUpload.json()) as { data: FileRecord[] }
    ).data[0]!;
    await upload('rep-a', { category: 'followup', followUpId: 'fa1' }, [
      file('site.jpg', 'image/jpeg', 'site photo'),
    ]);
    await uploadAvatar('rep-a', 'logo.png');

    const transfer = await router.request('/sales/customers/cust-a', {
      method: 'PATCH',
      headers: { ...asUser('manager'), 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: 'rep-b' }),
    });
    expect(transfer.status).toBe(200);

    // The new owner sees the whole customer: contacts, deals, follow-ups, files.
    const seen = await router.request('/sales/customers/cust-a', {
      headers: asUser('rep-b'),
    });
    expect(seen.status).toBe(200);
    const detail = (await seen.json()) as {
      data: {
        ownerId: string;
        contacts: unknown[];
        opportunities: unknown[];
        followUps: unknown[];
        files: FileRecord[];
      };
    };
    expect(detail.data.ownerId).toBe('rep-b');
    expect(detail.data.contacts).toHaveLength(1);
    expect(detail.data.opportunities.length).toBeGreaterThanOrEqual(2);
    expect(detail.data.followUps.length).toBeGreaterThanOrEqual(2);
    expect(detail.data.files.length).toBeGreaterThanOrEqual(3);

    const newOwnerDownload = await content('rep-b', dealFile.id);
    expect(newOwnerDownload.status).toBe(200);
    expect(Buffer.from(await newOwnerDownload.arrayBuffer()).toString()).toBe(
      'shared quote bytes',
    );

    // The old owner has lost the customer and every saved link into it.
    expect(
      (
        await router.request('/sales/customers/cust-a', {
          headers: asUser('rep-a'),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await router.request('/sales/opportunities/opp-a1', {
          headers: asUser('rep-a'),
        })
      ).status,
    ).toBe(404);
    expect((await content('rep-a', dealFile.id)).status).toBe(404);
    const oldOwnerFiles = await router.request(
      '/sales/files?opportunityId=opp-a1',
      { headers: asUser('rep-a') },
    );
    expect(
      ((await oldOwnerFiles.json()) as { data: FileRecord[] }).data,
    ).toEqual([]);

    // A manager can still reach the transferred record.
    expect((await content('manager', dealFile.id)).status).toBe(200);
  });

  it('rejects a file larger than 5 MB and stores nothing', async () => {
    const oversized = new File(
      [Buffer.alloc(5 * 1024 * 1024 + 1)],
      'huge.pdf',
      { type: 'application/pdf' },
    );
    const response = await upload(
      'rep-a',
      { category: 'opportunity', opportunityId: 'opp-a1' },
      [oversized],
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('FILE_TOO_LARGE');

    const rows = await database
      .query()
      .selectFrom('salesFiles')
      .select('id')
      .where('opportunityId', '=', 'opp-a1')
      .execute();
    expect(rows).toEqual([]);
  });

  it('requires authentication on every file route', async () => {
    expect((await router.request('/sales/files')).status).toBe(401);
    expect(
      (await router.request('/sales/files', { method: 'POST' })).status,
    ).toBe(401);
    expect((await router.request('/sales/files/anything/content')).status).toBe(
      401,
    );
  });

  async function uploadAvatar(userId: string, name: string): Promise<Response> {
    const body = new FormData();
    body.append('file', file(name, 'image/png', `avatar ${name}`));
    return router.request('/sales/customers/cust-a/avatar', {
      method: 'POST',
      headers: asUser(userId),
      body,
    });
  }
});
