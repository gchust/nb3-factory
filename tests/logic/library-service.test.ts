import { randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LibraryService } from '../../server/providers/library-service.js';
import {
  createAdministratorChecker,
  createFakeDrive,
  createFakeUploader,
  createLibraryDatabase,
  makeFile,
  type FakeDrive,
} from '../fixtures/library.js';

const ADMIN = 'admin-user';

describe('library service', () => {
  let database: DatabaseManager;
  let drive: FakeDrive;

  beforeEach(async () => {
    database = await createLibraryDatabase();
    drive = createFakeDrive();
  });

  afterEach(async () => {
    await database.destroy();
  });

  function service(): LibraryService {
    return new LibraryService({
      database,
      isAdministrator: createAdministratorChecker(new Set([ADMIN])),
      files: createFakeUploader(database, drive.objects),
      drive,
    });
  }

  async function insertMaterial(options: {
    title: string;
    visibility?: 'all' | 'restricted';
    borrowable?: boolean;
    totalCopies?: number;
    availableCopies?: number;
    readers?: readonly string[];
  }): Promise<number> {
    const now = new Date();
    const total = options.totalCopies ?? 2;
    const result = await database
      .query()
      .insertInto('materials')
      .values({
        title: options.title,
        category: '手册',
        summary: null,
        owner: null,
        borrowable: options.borrowable ?? true,
        totalCopies: total,
        availableCopies: options.availableCopies ?? total,
        visibility: options.visibility ?? 'all',
        coverFileId: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const id = Number(result.insertId);
    for (const userId of options.readers ?? []) {
      await database
        .query()
        .insertInto('materialReaders')
        .values({ materialId: id, userId, createdAt: now })
        .execute();
    }
    return id;
  }

  async function insertFile(
    materialId: number,
    options: { filename?: string; role?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    await database
      .query()
      .insertInto('materialFiles')
      .values({
        id,
        disk: 'local',
        key: `objects/${id}.txt`,
        filename: options.filename ?? 'notes.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 10,
        createdAt: now,
        updatedAt: now,
        materialId,
        role: options.role ?? 'attachment',
        uploaderId: ADMIN,
        uploaderName: 'admin',
      })
      .execute();
    return id;
  }

  async function available(id: number): Promise<number> {
    const row = await database
      .query()
      .selectFrom('materials')
      .select('availableCopies')
      .where('id', '=', id)
      .executeTakeFirst();
    return Number(row?.availableCopies ?? -1);
  }

  it('hides restricted materials from members who are not listed as readers', async () => {
    const open = await insertMaterial({ title: '公开手册' });
    const restricted = await insertMaterial({
      title: '财务模板',
      visibility: 'restricted',
      readers: ['member-a'],
    });
    const other = await insertMaterial({
      title: '审计底稿',
      visibility: 'restricted',
      readers: ['member-b'],
    });

    const forA = await service().listMaterials('member-a');
    expect(forA.map((row) => row.id).sort()).toEqual([open, restricted].sort());
    expect(forA.some((row) => row.id === other)).toBe(false);

    const forAdmin = await service().listMaterials(ADMIN);
    expect(forAdmin).toHaveLength(3);
  });

  it('denies reading a restricted material by id', async () => {
    const restricted = await insertMaterial({
      title: '财务模板',
      visibility: 'restricted',
      readers: ['member-a'],
    });
    await expect(
      service().getMaterial('member-b', restricted),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    await expect(
      service().getMaterial('member-a', restricted),
    ).resolves.toMatchObject({ id: restricted, canManage: false });
  });

  it('makes a repeated borrow request idempotent', async () => {
    const material = await insertMaterial({ title: '团队协作手册' });
    const first = await service().requestBorrow('member-a', 'A', material);
    const second = await service().requestBorrow('member-a', 'A', material);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.borrowing.id).toBe(first.borrowing.id);

    const rows = await service().listMyBorrowings('member-a');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
  });

  it('decrements stock exactly once per confirm, even when confirmed repeatedly', async () => {
    const material = await insertMaterial({ title: '手册', totalCopies: 1 });
    const request = await service().requestBorrow('member-a', 'A', material);

    const first = await service().confirmBorrow(ADMIN, request.borrowing.id);
    expect(first.changed).toBe(true);
    expect(await available(material)).toBe(0);

    const second = await service().confirmBorrow(ADMIN, request.borrowing.id);
    expect(second.changed).toBe(false);
    expect(await available(material)).toBe(0);
  });

  it('refuses to lend when no copy is available and leaves the request pending', async () => {
    const material = await insertMaterial({
      title: '绝版手册',
      totalCopies: 0,
      availableCopies: 0,
    });
    const request = await service().requestBorrow('member-a', 'A', material);
    await expect(
      service().confirmBorrow(ADMIN, request.borrowing.id),
    ).rejects.toMatchObject({ code: 'OUT_OF_STOCK', status: 409 });
    expect(await available(material)).toBe(0);
    const rows = await service().listMyBorrowings('member-a');
    expect(rows[0].status).toBe('pending');
  });

  it('restores stock exactly once on return', async () => {
    const material = await insertMaterial({ title: '手册', totalCopies: 1 });
    const request = await service().requestBorrow('member-a', 'A', material);
    await service().confirmBorrow(ADMIN, request.borrowing.id);

    const first = await service().confirmReturn(ADMIN, request.borrowing.id);
    expect(first.changed).toBe(true);
    expect(await available(material)).toBe(1);

    const second = await service().confirmReturn(ADMIN, request.borrowing.id);
    expect(second.changed).toBe(false);
    expect(await available(material)).toBe(1);
  });

  it('lets a member cancel only their own pending request', async () => {
    const material = await insertMaterial({ title: '手册' });
    const request = await service().requestBorrow('member-a', 'A', material);
    await expect(
      service().cancelBorrow('member-b', request.borrowing.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    const cancelled = await service().cancelBorrow(
      'member-a',
      request.borrowing.id,
    );
    expect(cancelled.status).toBe('cancelled');
  });

  it('refuses file access without a reading grant and allows it with one', async () => {
    const restricted = await insertMaterial({
      title: '财务模板',
      visibility: 'restricted',
      readers: ['member-a'],
    });
    const fileId = await insertFile(restricted);
    drive.objects.set(`objects/${fileId}.txt`, Buffer.from('secret'));

    await expect(
      service().getReadableFile('member-b', fileId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service().getReadableFile('member-a', fileId),
    ).resolves.toMatchObject({ id: fileId });
    const opened = await service().openFile('member-a', fileId);
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    expect(Buffer.concat(chunks).toString('utf8')).toBe('secret');
  });

  it('enforces the file count and size limits before storing anything', async () => {
    const material = await insertMaterial({ title: '手册' });
    await expect(
      service().uploadFiles(ADMIN, 'admin', material, {
        files: [
          makeFile('a.txt', 'a'),
          makeFile('b.txt', 'b'),
          makeFile('c.txt', 'c'),
          makeFile('d.txt', 'd'),
        ],
        role: 'attachment',
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_FILES' });

    await expect(
      service().uploadFiles(ADMIN, 'admin', material, {
        files: [
          new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.bin', {
            type: 'application/octet-stream',
          }),
        ],
        role: 'attachment',
      }),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });

    const rows = await database
      .query()
      .selectFrom('materialFiles')
      .select('id')
      .where('materialId', '=', material)
      .execute();
    expect(rows).toHaveLength(0);
  });

  it('stores uploads with their uploader and replaces the previous cover', async () => {
    const material = await insertMaterial({ title: '手册' });
    const admin = new LibraryService({
      database,
      isAdministrator: createAdministratorChecker(new Set([ADMIN])),
      files: createFakeUploader(database, drive.objects),
      drive,
    });

    const [firstCover] = await admin.uploadFiles(ADMIN, '管理员', material, {
      files: [makeFile('封面一.png', 'one', 'image/png')],
      role: 'cover',
    });
    expect(firstCover.uploaderName).toBe('管理员');
    expect(firstCover.previewKind).toBe('image');

    const before = await database
      .query()
      .selectFrom('materials')
      .select('coverFileId')
      .where('id', '=', material)
      .executeTakeFirst();
    expect(before?.coverFileId).toBe(firstCover.id);

    const [secondCover] = await admin.uploadFiles(ADMIN, '管理员', material, {
      files: [makeFile('封面二.png', 'two', 'image/png')],
      role: 'cover',
    });

    const remaining = await database
      .query()
      .selectFrom('materialFiles')
      .select('id')
      .where('materialId', '=', material)
      .execute();
    expect(remaining.map((row) => row.id)).toEqual([secondCover.id]);
    expect(drive.objects.has(`objects/${firstCover.id}.png`)).toBe(false);

    const after = await database
      .query()
      .selectFrom('materials')
      .select('coverFileId')
      .where('id', '=', material)
      .executeTakeFirst();
    expect(after?.coverFileId).toBe(secondCover.id);
  });

  it('keeps available stock in step when the total copy count changes', async () => {
    const material = await insertMaterial({ title: '手册', totalCopies: 2 });
    await service().updateMaterial(ADMIN, material, {
      title: '手册',
      totalCopies: 4,
    });
    expect(await available(material)).toBe(4);

    await service().updateMaterial(ADMIN, material, {
      title: '手册',
      totalCopies: 1,
    });
    expect(await available(material)).toBe(1);
  });

  it('resolves a borrower name for records that stored none', async () => {
    const connection = database.connection();
    await connection.builder.createCollection('user', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('name', { length: 255 }).nullable();
      collection.string('username', { length: 255 }).nullable();
      collection.string('email', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
    const material = await insertMaterial({ title: '手册' });
    const now = new Date();
    await database
      .query()
      .insertInto('user')
      .values({
        id: 'member-a',
        name: '李梅',
        username: 'limei',
        email: 'limei@example.com',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    // A seeded row created before the borrower name was stored.
    await database
      .query()
      .insertInto('materialBorrowings')
      .values({
        materialId: material,
        userId: 'member-a',
        borrowerName: null,
        status: 'pending',
        requestedAt: now,
        borrowedAt: null,
        returnedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const rows = await service().listBorrowings(ADMIN);
    expect(rows).toHaveLength(1);
    expect(rows[0].borrowerName).toBe('李梅');
  });

  it('refuses management operations for a non-administrator', async () => {
    const material = await insertMaterial({ title: '手册' });
    await expect(
      service().createMaterial('member-a', { title: '新资料' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    await expect(
      service().deleteMaterial('member-a', material),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
