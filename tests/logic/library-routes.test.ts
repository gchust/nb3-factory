// @vitest-environment node
import { randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LibraryService } from '../../server/providers/library-service.js';
import { createLibraryRouter } from '../../server/routes/library.js';
import {
  createAdministratorChecker,
  createFakeDrive,
  createFakeUploader,
  createLibraryDatabase,
  createTestAuth,
  type FakeDrive,
} from '../fixtures/library.js';

const ADMIN = 'admin-user';

describe('library API routes', () => {
  let database: DatabaseManager;
  let drive: FakeDrive;
  let router: ReturnType<typeof createLibraryRouter>;

  beforeEach(async () => {
    database = await createLibraryDatabase();
    drive = createFakeDrive();
    const service = new LibraryService({
      database,
      isAdministrator: createAdministratorChecker(new Set([ADMIN])),
      files: createFakeUploader(database, drive.objects),
      drive,
    });
    router = createLibraryRouter({
      auth: createTestAuth(),
      service,
      files: { validateCollection: () => Promise.resolve() },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function insertRestrictedMaterial(): Promise<number> {
    const now = new Date();
    const result = await database
      .query()
      .insertInto('materials')
      .values({
        title: '财务模板',
        category: '财务',
        summary: null,
        owner: null,
        borrowable: true,
        totalCopies: 1,
        availableCopies: 1,
        visibility: 'restricted',
        coverFileId: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const id = Number(result.insertId);
    await database
      .query()
      .insertInto('materialReaders')
      .values({ materialId: id, userId: 'member-a', createdAt: now })
      .execute();
    return id;
  }

  async function insertFile(materialId: number, body: string): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    await database
      .query()
      .insertInto('materialFiles')
      .values({
        id,
        disk: 'local',
        key: `objects/${id}.txt`,
        filename: 'notes.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: body.length,
        createdAt: now,
        updatedAt: now,
        materialId,
        role: 'attachment',
        uploaderId: ADMIN,
        uploaderName: 'admin',
      })
      .execute();
    drive.objects.set(`objects/${id}.txt`, Buffer.from(body, 'utf8'));
    return id;
  }

  function headers(user?: string): Record<string, string> {
    return user ? { 'x-test-user': user, 'x-test-name': user } : {};
  }

  it('rejects anonymous requests on every library path', async () => {
    for (const path of [
      '/me',
      '/materials',
      '/borrowings/mine',
      '/borrowings',
      '/users',
    ]) {
      const response = await router.request(path);
      expect(response.status).toBe(401);
    }
  });

  it('returns only readable materials to a member', async () => {
    const restricted = await insertRestrictedMaterial();
    const response = await router.request('/materials', {
      headers: headers('member-b'),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { id: number }[];
    };
    expect(body.data).toHaveLength(0);

    const detail = await router.request(`/materials/${restricted}`, {
      headers: headers('member-b'),
    });
    expect(detail.status).toBe(403);

    const allowed = await router.request(`/materials/${restricted}`, {
      headers: headers('member-a'),
    });
    expect(allowed.status).toBe(200);
  });

  it('forbids a member from administrating materials or borrowings', async () => {
    const restricted = await insertRestrictedMaterial();
    const created = await router.request('/materials', {
      method: 'POST',
      headers: { ...headers('member-a'), 'content-type': 'application/json' },
      body: JSON.stringify({ title: '新资料' }),
    });
    expect(created.status).toBe(403);

    const borrowings = await router.request('/borrowings', {
      headers: headers('member-a'),
    });
    expect(borrowings.status).toBe(403);

    const file = await insertFile(restricted, 'hello');
    const upload = await router.request(`/materials/${restricted}/files`, {
      method: 'POST',
      headers: headers('member-a'),
      body: '',
    });
    expect(upload.status).toBe(403);

    // The member who may read the file still cannot delete it.
    const removal = await router.request(
      `/materials/${restricted}/files/${file}`,
      { method: 'DELETE', headers: headers('member-a') },
    );
    expect(removal.status).toBe(403);
  });

  it('serves file bytes only to a caller with a reading grant', async () => {
    const material = await insertRestrictedMaterial();
    const file = await insertFile(material, '受保护的正文');

    const forbidden = await router.request(`/files/${file}/content`, {
      headers: headers('member-b'),
    });
    expect(forbidden.status).toBe(403);

    const inline = await router.request(`/files/${file}/content`, {
      headers: headers('member-a'),
    });
    expect(inline.status).toBe(200);
    expect(inline.headers.get('cache-control')).toContain('no-store');
    expect(inline.headers.get('content-disposition')).toContain('inline');
    expect(await inline.text()).toBe('受保护的正文');

    const download = await router.request(`/files/${file}/content?download=1`, {
      headers: headers('member-a'),
    });
    expect(download.headers.get('content-disposition')).toContain('attachment');
  });

  it('rejects a batch larger than three files with a clear code', async () => {
    const material = await insertRestrictedMaterial();
    const form = new FormData();
    for (const name of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) {
      form.append('files', new File(['x'], name, { type: 'text/plain' }));
    }
    form.append('role', 'attachment');

    const response = await router.request(`/materials/${material}/files`, {
      method: 'POST',
      headers: headers(ADMIN),
      body: form,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('TOO_MANY_FILES');
  });

  it('runs the full borrow, confirm and return flow for an administrator', async () => {
    const material = await insertRestrictedMaterial();
    const requested = await router.request(
      `/materials/${material}/borrowings`,
      {
        method: 'POST',
        headers: headers('member-a'),
      },
    );
    expect(requested.status).toBe(200);
    const requestedBody = (await requested.json()) as {
      data: { id: number };
      created: boolean;
    };
    expect(requestedBody.created).toBe(true);

    const confirmed = await router.request(
      `/borrowings/${requestedBody.data.id}/borrow`,
      { method: 'POST', headers: headers(ADMIN) },
    );
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json()) as { changed: boolean }).toMatchObject({
      changed: true,
    });

    const returned = await router.request(
      `/borrowings/${requestedBody.data.id}/return`,
      { method: 'POST', headers: headers(ADMIN) },
    );
    expect(returned.status).toBe(200);
    expect((await returned.json()) as { changed: boolean }).toMatchObject({
      changed: true,
    });
  });
});
