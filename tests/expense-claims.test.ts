// @vitest-environment node
/**
 * Expense reimbursement (报销) tests.
 *
 * All three layers run against a real in-memory SQLite database built by
 * applying the application's own migration:
 *
 * 1. Migration up/down - the schema is created and reversed on a real
 *    database engine (not just a TS import).
 * 2. Service domain rules - sum-mismatch rejection, strict per-owner
 *    visibility, approve/reject semantics, attachment deletion.
 * 3. Routes - the production `createRouter()` factories with the real service
 *    wired in and only auth/authorization/file-manager supplied as doubles:
 *    anonymous 401s, non-finance 403s, finance success paths, 422 mapping.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { Auth } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';

import migration from '../database/main/migrations/202609120001_create_expense_claims.js';
import issuerMigration from '../database/main/migrations/202609120002_make_account_issuer_nullable.js';
import pageAccessSeed from '../database/main/seeds/202609120004_grant_expense_claims_pages_access.js';
import { apiRoutes, rootRoutes } from '../server/routes/index.js';
import {
  createExpenseClaimService,
  expenseClaimServiceToken,
  type ExpenseClaimService,
} from '../server/providers/expense-claims.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_EMPLOYEE_ID = '33333333-3333-4333-8333-333333333333';

async function insertUser(
  manager: DatabaseManager,
  id: string,
  name: string,
  username: string,
): Promise<void> {
  const now = new Date();
  await manager
    .query('main')
    .insertInto('user')
    .values({
      id,
      name,
      username,
      email: `${username}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

/** Mirrors what the file repository table holds for an uploaded file. */
interface StoredFile {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

describe('expense-claims', () => {
  let manager: DatabaseManager;
  let service: ExpenseClaimService;
  let financeUsers: Set<string>;
  let uploadedFiles: Map<string, StoredFile>;

  let employeeClaims: { id: string; claimNumber: string }[];
  let otherClaims: { id: string; claimNumber: string }[];
  let adminClaims: { id: string; claimNumber: string }[];

  /** The principal the auth double reports for the next request. */
  let currentUserId: () => string | null;

  async function seedClaim(
    applicantId: string,
    applicantName: string,
    status: 'pending' | 'approved' | 'rejected',
    totalAmount: number,
    items: { itemName: string; amount: number }[],
    reviewerId: string | null = null,
    rejectReason: string | null = null,
  ): Promise<{ id: string; claimNumber: string }> {
    const id = crypto.randomUUID();
    const claimNumber = `BX-TEST-${crypto.randomUUID().slice(0, 6)}`;
    const now = new Date();
    await manager
      .query('main')
      .insertInto('expense_claims')
      .values({
        id,
        claimNumber,
        applicantId,
        applicantName,
        expenseType: 'travel',
        expenseDate: '2026-09-01',
        totalAmount,
        description: '测试报销单',
        status,
        reviewerId: status === 'pending' ? null : reviewerId,
        reviewedAt: status === 'pending' ? null : now,
        rejectReason,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await manager
      .query('main')
      .insertInto('expense_claim_items')
      .values(
        items.map((item) => ({
          id: crypto.randomUUID(),
          claimId: id,
          itemName: item.itemName,
          amount: item.amount,
          note: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();
    return { id, claimNumber };
  }

  async function insertFileRecord(record: StoredFile): Promise<void> {
    await manager
      .query('main')
      .insertInto('expense_claim_files')
      .values({ ...record })
      .execute();
    uploadedFiles.set(record.id, record);
  }

  function makeAuth(): Auth {
    return {
      required: () => async (context: Context, next: () => Promise<void>) => {
        const userId = currentUserId();
        if (userId === null) {
          // Mirrors the real authentication middleware: no session -> 401
          // before the handler runs.
          return context.json(
            { code: 'UNAUTHORIZED', message: 'Authentication required' },
            401,
          );
        }
        context.set('auth', {
          user: {
            id: userId,
            name: 'tester',
            email: 'tester@example.com',
          },
          session: {
            id: 'session-1',
            token: 'token-1',
            userId,
            expiresAt: new Date(Date.now() + 3600_000),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        await next();
      },
    } as unknown as Auth;
  }

  function makeAuthorization(): AppAuthorization {
    return {
      permissionSets: {
        listAssignments: async () =>
          [...financeUsers].map((userId) => ({
            id: `assignment-${userId}`,
            subject: { type: 'user', id: userId },
            permissionSet: 'system-administrator',
          })),
      },
    } as unknown as AppAuthorization;
  }

  function makeFileManager(
    override: {
      uploadMany?: () => Promise<{
        createdCount: number;
        records: StoredFile[];
      }>;
    } = {},
  ): ServerFileRepositoryManager {
    return {
      repository: () => ({
        uploadMany:
          override.uploadMany ??
          (async (input: { files: File[] }) => {
            const records = input.files.map((file) => {
              const id = crypto.randomUUID();
              const filename = file.name || 'upload';
              const ext = (filename.split('.').pop() ?? '').toLowerCase();
              const record: StoredFile = {
                id,
                disk: 'local',
                key: `${id}.${ext}`,
                filename,
                ext,
                mimeType: file.type || 'application/octet-stream',
                size: file.size,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              return record;
            });
            return { createdCount: records.length, records };
          }),
        getUrl: (record: StoredFile) =>
          `/uploads/expense-claims/${record.id}.${record.ext}`,
        findOne: async (input: { filter: { id: string } }) =>
          uploadedFiles.get(input.filter.id),
      }),
    } as unknown as ServerFileRepositoryManager;
  }

  function buildRouters(
    fileManagerOverride: {
      uploadMany?: () => Promise<{
        createdCount: number;
        records: StoredFile[];
      }>;
    } = {},
  ): { apiRouter: Hono; rootRouter: Hono } {
    const container = new ServiceContainer();
    container.instance(authenticationToken, makeAuth());
    container.instance(authorizationToken, makeAuthorization());
    container.instance(
      serverFileRepositoryManagerToken,
      makeFileManager(fileManagerOverride),
    );
    container.instance(expenseClaimServiceToken, service);
    const app = {
      publicBasePath: '/main',
      container,
    } as unknown as Application;
    return {
      apiRouter: apiRoutes.createRouter(app),
      rootRouter: rootRoutes.createRouter(app),
    };
  }

  beforeAll(async () => {
    manager = createDatabaseManager({
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
          schemaManagement: 'managed',
        },
      },
    });
    await manager.connect('main');
    await manager.builder('main').createCollection('user', (collection) => {
      collection.uuid('id').notNull();
      collection.primary('id', { name: 'pk_user' });
      collection.string('name', { length: 255 }).notNull();
      collection.string('username', { length: 64 }).notNull();
      collection.string('email', { length: 255 }).notNull();
      collection.boolean('emailVerified').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
    await migration.up({
      builder: manager.builder('main'),
      query: manager.query('main'),
      connection: manager.connection('main'),
    });
    await insertUser(manager, ADMIN_ID, '管理员', 'admin');
    await insertUser(manager, EMPLOYEE_ID, '员工甲', 'employee');
    await insertUser(manager, OTHER_EMPLOYEE_ID, '员工乙', 'other-employee');

    const drive = {
      instance: () => ({
        exists: async () => true,
        getStream: async () => ReadableStream.from([new Uint8Array([1])]),
      }),
    } as never;

    service = createExpenseClaimService(manager, makeFileManager(), drive);
    await reset();
  });

  afterAll(async () => {
    await manager.disconnect('main');
  });

  async function reset(): Promise<void> {
    financeUsers = new Set([ADMIN_ID]);
    uploadedFiles = new Map();
    await manager
      .query('main')
      .deleteFrom('expense_claim_attachments')
      .where('id', 'is not', null)
      .execute();
    await manager
      .query('main')
      .deleteFrom('expense_claim_items')
      .where('id', 'is not', null)
      .execute();
    await manager
      .query('main')
      .deleteFrom('expense_claims')
      .where('id', 'is not', null)
      .execute();
    employeeClaims = [];
    otherClaims = [];
    adminClaims = [];
  }

  beforeEach(async () => {
    await reset();
    currentUserId = () => null;
    employeeClaims = [
      await seedClaim(EMPLOYEE_ID, '员工甲', 'pending', 100, [
        { itemName: '高铁票', amount: 100 },
      ]),
    ];
    otherClaims = [
      await seedClaim(OTHER_EMPLOYEE_ID, '员工乙', 'pending', 50, [
        { itemName: '出租车', amount: 50 },
      ]),
    ];
    adminClaims = [
      await seedClaim(ADMIN_ID, '管理员', 'pending', 200, [
        { itemName: '文件夹', amount: 80 },
        { itemName: '签字笔', amount: 120 },
      ]),
    ];
  });

  describe('migration', () => {
    it('up creates the tables and down reverses them', async () => {
      for (const table of [
        'expense_claims',
        'expense_claim_items',
        'expense_claim_attachments',
        'expense_claim_files',
      ]) {
        await expect(
          manager.query('main').selectFrom(table).selectAll().execute(),
        ).resolves.toBeDefined();
      }
      await migration.down!({
        builder: manager.builder('main'),
        query: manager.query('main'),
        connection: manager.connection('main'),
      });
      for (const table of ['expense_claims', 'expense_claim_files']) {
        await expect(
          manager.query('main').selectFrom(table).selectAll().execute(),
        ).rejects.toThrow();
      }
      await migration.up({
        builder: manager.builder('main'),
        query: manager.query('main'),
        connection: manager.connection('main'),
      });
      await reset();
    });
  });

  describe('service domain rules', () => {
    it('rejects a claim whose item sum does not match the total', async () => {
      await expect(
        service.create(EMPLOYEE_ID, {
          expenseType: 'travel',
          expenseDate: '2026-09-10',
          totalAmount: 100,
          description: null,
          items: [
            { itemName: '高铁票', amount: 60 },
            { itemName: '打车', amount: 30 },
          ],
        }),
      ).rejects.toMatchObject({
        code: 'ITEM_SUM_MISMATCH',
        status: 422,
      });
    });

    it('creates a claim with items and the right applicant name', async () => {
      const { id } = await service.create(EMPLOYEE_ID, {
        expenseType: 'office',
        expenseDate: '2026-09-11',
        totalAmount: 320,
        description: '办公用品',
        items: [
          { itemName: '文件夹', amount: 120, note: '10个' },
          { itemName: '签字笔', amount: 200 },
        ],
      });
      const detail = await service.getDetail(id, EMPLOYEE_ID, false, '/main');
      expect(detail).not.toBeNull();
      expect(detail!.applicantId).toBe(EMPLOYEE_ID);
      expect(detail!.applicantName).toBe('员工甲');
      expect(detail!.status).toBe('pending');
      expect(detail!.items.map((item) => item.amount)).toEqual([120, 200]);
      expect(detail!.totalAmount).toBe(320);
    });

    it('lists only the caller-owned claims for a non-finance user', async () => {
      const list = await service.list(EMPLOYEE_ID, false);
      expect(list.map((claim) => claim.id).sort()).toEqual(
        employeeClaims.map((claim) => claim.id).sort(),
      );
      expect(list.every((claim) => claim.applicantId === EMPLOYEE_ID)).toBe(
        true,
      );
    });

    it('directly opening another user claim is forbidden', async () => {
      await expect(
        service.getDetail(otherClaims[0].id, EMPLOYEE_ID, false, '/main'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    });

    it('a finance user sees every claim', async () => {
      const list = await service.list(ADMIN_ID, true);
      expect(list.length).toBe(
        employeeClaims.length + otherClaims.length + adminClaims.length,
      );
    });

    it('approves a pending claim and records the reviewer', async () => {
      const result = await service.review(
        employeeClaims[0].id,
        ADMIN_ID,
        'approve',
        null,
      );
      expect(result.status).toBe('approved');
      const after = await service.getDetail(
        employeeClaims[0].id,
        EMPLOYEE_ID,
        false,
        '/main',
      );
      expect(after!.status).toBe('approved');
      expect(after!.reviewerId).toBe(ADMIN_ID);
      expect(after!.reviewerName).toBe('管理员');
    });

    it('rejects a claim with a required reason', async () => {
      await expect(
        service.review(employeeClaims[0].id, ADMIN_ID, 'reject', ''),
      ).rejects.toMatchObject({ code: 'REJECT_REASON_REQUIRED', status: 400 });
      const result = await service.review(
        employeeClaims[0].id,
        ADMIN_ID,
        'reject',
        '发票抬头不符。',
      );
      expect(result.status).toBe('rejected');
      const after = await service.getDetail(
        employeeClaims[0].id,
        EMPLOYEE_ID,
        false,
        '/main',
      );
      expect(after!.status).toBe('rejected');
      expect(after!.rejectReason).toBe('发票抬头不符。');
    });

    it('refuses to review a claim that is not pending', async () => {
      await service.review(employeeClaims[0].id, ADMIN_ID, 'approve', null);
      await expect(
        service.review(employeeClaims[0].id, ADMIN_ID, 'reject', '原因'),
      ).rejects.toMatchObject({ code: 'CLAIM_NOT_PENDING', status: 409 });
    });

    it('deletes one attachment without touching the rest of the claim', async () => {
      const fileA = crypto.randomUUID();
      const fileB = crypto.randomUUID();
      await insertFileRecord({
        id: fileA,
        disk: 'local',
        key: `${fileA}.txt`,
        filename: 'a.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 9,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await insertFileRecord({
        id: fileB,
        disk: 'local',
        key: `${fileB}.txt`,
        filename: 'b.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 9,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const { id } = await service.create(EMPLOYEE_ID, {
        expenseType: 'office',
        expenseDate: '2026-09-11',
        totalAmount: 60,
        description: null,
        items: [{ itemName: '文具', amount: 60 }],
        attachments: [{ fileId: fileA }, { fileId: fileB }],
      });
      const before = await service.getDetail(id, EMPLOYEE_ID, false, '/main');
      expect(before!.attachments.length).toBe(2);
      const first = before!.attachments[0];

      const deleted = await service.deleteAttachment(
        EMPLOYEE_ID,
        false,
        first.id,
      );
      expect(deleted).toBe(true);

      const after = await service.getDetail(id, EMPLOYEE_ID, false, '/main');
      expect(
        after!.attachments.map((attachment) => attachment.id),
      ).not.toContain(first.id);
      expect(after!.attachments.length).toBe(1);

      // The orphaned file record is removed too.
      const fileRows = await manager
        .query('main')
        .selectFrom('expense_claim_files')
        .select('id')
        .where('id', 'in', [fileA, fileB])
        .execute();
      expect(fileRows.length).toBe(1);
    });

    it('refuses attachment deletion after the claim is reviewed', async () => {
      const fileId = crypto.randomUUID();
      await insertFileRecord({
        id: fileId,
        disk: 'local',
        key: `${fileId}.txt`,
        filename: 'a.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 9,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const { id } = await service.create(EMPLOYEE_ID, {
        expenseType: 'office',
        expenseDate: '2026-09-11',
        totalAmount: 30,
        description: null,
        items: [{ itemName: '文具', amount: 30 }],
        attachments: [{ fileId }],
      });
      await service.review(id, ADMIN_ID, 'approve', null);
      const detail = await service.getDetail(id, EMPLOYEE_ID, false, '/main');
      await expect(
        service.deleteAttachment(EMPLOYEE_ID, false, detail!.attachments[0].id),
      ).rejects.toMatchObject({
        code: 'ATTACHMENT_CLAIM_NOT_PENDING',
        status: 409,
      });
    });
  });

  describe('routes', () => {
    let apiRouter: Hono;
    let rootRouter: Hono;

    beforeEach(() => {
      ({ apiRouter, rootRouter } = buildRouters());
    });

    it('rejects an anonymous list with 401', async () => {
      const response = await apiRouter.request('/expense-claims');
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects an anonymous detail with 401', async () => {
      const response = await apiRouter.request(
        `/expense-claims/${employeeClaims[0].id}`,
      );
      expect(response.status).toBe(401);
    });

    it('rejects an anonymous upload with 401', async () => {
      const form = new FormData();
      form.append(
        'file',
        new File(['hello'], 'hello.txt', { type: 'text/plain' }),
      );
      const response = await apiRouter.request(
        '/expenseClaimFiles:uploadMany',
        {
          method: 'POST',
          body: form,
        },
      );
      expect(response.status).toBe(401);
    });

    it('rejects an anonymous download with 401', async () => {
      const response = await rootRouter.request(
        '/uploads/expense-claims/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.txt',
      );
      expect(response.status).toBe(401);
    });

    it('returns 422 as a structured error for a mismatched claim', async () => {
      currentUserId = () => EMPLOYEE_ID;
      const response = await apiRouter.request('/expense-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseType: 'travel',
          expenseDate: '2026-09-10',
          totalAmount: 100,
          items: [
            { itemName: '高铁票', amount: 60 },
            { itemName: '打车', amount: 30 },
          ],
        }),
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: 'ITEM_SUM_MISMATCH',
      });
    });

    it('creates a claim and returns its id and claim number', async () => {
      currentUserId = () => EMPLOYEE_ID;
      const response = await apiRouter.request('/expense-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseType: 'travel',
          expenseDate: '2026-09-10',
          totalAmount: 100,
          description: '差旅',
          items: [{ itemName: '高铁票', amount: 100 }],
        }),
      });
      expect(response.status).toBe(201);
      const body = (await response.json()) as {
        data: { id: string; claimNumber: string };
      };
      expect(body.data.id).toBeTruthy();
      expect(body.data.claimNumber).toMatch(/^BX-/);
      const detail = await service.getDetail(
        body.data.id,
        EMPLOYEE_ID,
        false,
        '/main',
      );
      expect(detail!.applicantName).toBe('员工甲');
      expect(detail!.items).toHaveLength(1);
    });

    it('a non-finance user lists only their own claims', async () => {
      currentUserId = () => EMPLOYEE_ID;
      const response = await apiRouter.request('/expense-claims');
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { id: string }[] };
      expect(body.data.length).toBe(employeeClaims.length);
      expect(body.data[0].id).toBe(employeeClaims[0].id);
    });

    it('a direct URL to another user claim is a 403 for a non-finance user', async () => {
      currentUserId = () => EMPLOYEE_ID;
      const response = await apiRouter.request(
        `/expense-claims/${otherClaims[0].id}`,
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('a missing claim is a 404', async () => {
      currentUserId = () => ADMIN_ID;
      const response = await apiRouter.request(
        '/expense-claims/99999999-9999-4999-8999-999999999999',
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'CLAIM_NOT_FOUND' });
    });

    it('a non-finance user cannot review', async () => {
      currentUserId = () => EMPLOYEE_ID;
      const response = await apiRouter.request(
        `/expense-claims/${employeeClaims[0].id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' }),
        },
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('a non-finance user cannot delete another claim attachment', async () => {
      currentUserId = () => EMPLOYEE_ID;
      const fileId = crypto.randomUUID();
      await insertFileRecord({
        id: fileId,
        disk: 'local',
        key: `${fileId}.txt`,
        filename: 'a.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 9,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const { id } = await service.create(OTHER_EMPLOYEE_ID, {
        expenseType: 'office',
        expenseDate: '2026-09-11',
        totalAmount: 30,
        description: null,
        items: [{ itemName: '文具', amount: 30 }],
        attachments: [{ fileId }],
      });
      const detail = await service.getDetail(
        id,
        OTHER_EMPLOYEE_ID,
        false,
        '/main',
      );
      const response = await apiRouter.request(
        `/expense-claims/${id}/attachments/${detail!.attachments[0].id}`,
        { method: 'DELETE' },
      );
      expect(response.status).toBe(403);
    });

    it('a finance user approves a claim', async () => {
      currentUserId = () => ADMIN_ID;
      const response = await apiRouter.request(
        `/expense-claims/${employeeClaims[0].id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' }),
        },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { status: string } };
      expect(body.data.status).toBe('approved');
    });

    it('a finance user rejects a claim with a reason', async () => {
      currentUserId = () => ADMIN_ID;
      const response = await apiRouter.request(
        `/expense-claims/${employeeClaims[0].id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject', reason: '发票不符。' }),
        },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { status: string } };
      expect(body.data.status).toBe('rejected');
    });

    it('rejects a review without a reason', async () => {
      currentUserId = () => ADMIN_ID;
      const response = await apiRouter.request(
        `/expense-claims/${employeeClaims[0].id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject' }),
        },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'REJECT_REASON_REQUIRED',
      });
    });

    it('rejects an unknown review action', async () => {
      currentUserId = () => ADMIN_ID;
      const response = await apiRouter.request(
        `/expense-claims/${employeeClaims[0].id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ban' }),
        },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'INVALID_ACTION' });
    });

    it('an upload creates file records with content URLs', async () => {
      currentUserId = () => EMPLOYEE_ID;
      const recordA: StoredFile = {
        id: crypto.randomUUID(),
        disk: 'local',
        key: 'key-a',
        filename: 'a.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 9,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const recordB: StoredFile = {
        id: crypto.randomUUID(),
        disk: 'local',
        key: 'key-b',
        filename: 'b.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 9,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { apiRouter: uploadRouter } = buildRouters({
        uploadMany: async () => ({
          createdCount: 2,
          records: [recordA, recordB],
        }),
      });
      const form = new FormData();
      form.append('file', new File(['hello'], 'a.txt', { type: 'text/plain' }));
      form.append('file', new File(['world'], 'b.txt', { type: 'text/plain' }));
      const response = await uploadRouter.request(
        '/expenseClaimFiles:uploadMany',
        { method: 'POST', body: form },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: {
          createdCount: number;
          records: { id: string; contentUrl: string }[];
        };
      };
      expect(body.data.createdCount).toBe(2);
      expect(body.data.records[0].contentUrl).toMatch(
        /^\/main\/uploads\/expense-claims\//,
      );
    });
  });

  describe('registration schema repair (account issuer nullable)', () => {
    it('up relaxes issuer so NULL credential accounts may be stored, down restores NOT NULL', async () => {
      await manager
        .builder('main')
        .createCollection('account', (collection) => {
          collection.uuid('id').notNull();
          collection.primary('id', { name: 'pk_account' });
          collection.string('issuer', { length: 255 }).notNull();
        });
      const accountId = crypto.randomUUID();
      await expect(
        manager
          .query('main')
          .insertInto('account')
          .values({ id: accountId, issuer: null })
          .execute(),
      ).rejects.toThrow();

      await issuerMigration.up({
        builder: manager.builder('main'),
        query: manager.query('main'),
        connection: manager.connection('main'),
      });

      // Better Auth's public sign-up writes credential accounts without an
      // issuer; the column must accept NULL for registration to work.
      await expect(
        manager
          .query('main')
          .insertInto('account')
          .values({ id: accountId, issuer: null })
          .execute(),
      ).resolves.toBeDefined();
      await manager
        .query('main')
        .deleteFrom('account')
        .where('id', 'is not', null)
        .execute();

      await issuerMigration.down!({
        builder: manager.builder('main'),
        query: manager.query('main'),
        connection: manager.connection('main'),
      });
      await expect(
        manager
          .query('main')
          .insertInto('account')
          .values({ id: accountId, issuer: null })
          .execute(),
      ).rejects.toThrow();
      await manager.builder('main').dropCollection('account');
    });
  });

  describe('default-pages page-access seed', () => {
    it('grants the expense-claims pages idempotently', async () => {
      await manager
        .builder('main')
        .createCollection('authorizationPermissionSets', (collection) => {
          collection.uuid('id').notNull();
          collection.primary('id', {
            name: 'pk_authorization_permission_sets',
          });
          collection.string('key', { length: 128 }).notNull();
          collection.string('title', { length: 255 }).notNull();
          collection.json('grants').notNull();
          collection.datetime('createdAt').notNull();
          collection.datetime('updatedAt').notNull();
        });
      await manager
        .builder('main')
        .createCollection(
          'authorizationPermissionSetAssignments',
          (collection) => {
            collection.uuid('id').notNull();
            collection.primary('id', {
              name: 'pk_authorization_permission_set_assignments',
            });
            collection.string('subjectType', { length: 64 }).notNull();
            collection.string('subjectId', { length: 128 }).notNull();
            collection.string('permissionSetKey', { length: 128 }).notNull();
            collection.datetime('createdAt').notNull();
            collection.datetime('updatedAt').notNull();
          },
        );
      await manager
        .query('main')
        .insertInto('authorizationPermissionSets')
        .values({
          id: 'set-1',
          key: 'default-pages',
          title: 'Default pages',
          grants: JSON.stringify([
            {
              resource: { type: 'page', id: 'home' },
              actions: [{ action: 'access' }],
            },
          ]),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
      await manager
        .query('main')
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: 'authenticated:*:default-pages',
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: 'default-pages',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();

      await pageAccessSeed.run({ query: manager.query('main') });
      await pageAccessSeed.run({ query: manager.query('main') });

      const set = await manager
        .query('main')
        .selectFrom('authorizationPermissionSets')
        .select('grants')
        .where('key', '=', 'default-pages')
        .executeTakeFirstOrThrow();
      const grants = JSON.parse(set.grants) as Array<{
        resource: { type: string; id: string };
      }>;
      expect(
        grants
          .filter((g) => g.resource.type === 'page')
          .map((g) => g.resource.id),
      ).toEqual(
        expect.arrayContaining([
          'home',
          'expense-claims',
          'expense-claims.new',
          'expense-claims.detail',
        ]),
      );
      expect(grants).toHaveLength(4); // no duplicates after the second run

      await manager
        .builder('main')
        .dropCollection('authorizationPermissionSetAssignments');
      await manager
        .builder('main')
        .dropCollection('authorizationPermissionSets');
    });
  });
});
