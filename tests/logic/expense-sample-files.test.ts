// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DatabaseManager } from '@nocobase/db';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import type { ServerFileRepository } from '@nocobase/app-plugin-file/server';
import { Hono } from 'hono';

import {
  createExpenseService,
  type ExpenseActor,
  type ExpenseService,
} from '../../server/providers/expense.js';
import { createExpenseFileAccessMiddleware } from '../../server/routes/expense-files.js';
import {
  createFileRepository,
  createTestDatabase,
  createTestDrive,
  migrate,
  seedWorkflowFixtures,
  type TestDrive,
} from '../helpers/expense-database.js';
import { resolvePreviewKind } from '../../client/pages/expenses/files/file-utils.js';

const SAMPLES_DIR = fileURLToPath(
  new URL('../../public/samples', import.meta.url),
);
const PNG = path.join(SAMPLES_DIR, 'sample-receipt.png');
const PDF = path.join(SAMPLES_DIR, 'sample-itinerary.pdf');
const TXT = path.join(SAMPLES_DIR, 'sample-note.txt');

async function errorCode(
  run: () => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe('expense sample files end to end', () => {
  let database: DatabaseManager;
  let service: ExpenseService;
  let testDrive: TestDrive;
  let repository: ServerFileRepository;

  beforeEach(async () => {
    database = createTestDatabase();
    await migrate(database);
    await seedWorkflowFixtures(database);
    service = createExpenseService(database, { publicBasePath: '/main' });
    testDrive = await createTestDrive();
    repository = createFileRepository(database, testDrive.drive);
  });

  afterEach(async () => {
    testDrive.dispose();
    await database.destroy();
  });

  async function upload(samplePath: string): Promise<string> {
    const bytes = readFileSync(samplePath);
    const { record } = await repository.uploadOne({
      file: new File([new Uint8Array(bytes)], path.basename(samplePath), {
        type: mimeFor(path.basename(samplePath)),
      }),
    });
    return record.id;
  }

  function mimeFor(filename: string): string {
    if (filename.endsWith('.png')) return 'image/png';
    if (filename.endsWith('.pdf')) return 'application/pdf';
    return 'text/plain';
  }

  async function storedBytes(fileId: string): Promise<Buffer> {
    const row = await database
      .query()
      .selectFrom('expenseFiles')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst<{ key: string; disk: string }>();
    const bytes = await testDrive.drive.use(row!.disk).getBytes(row!.key);
    return Buffer.from(bytes);
  }

  async function draftReport(): Promise<{
    actor: ExpenseActor;
    reportId: string;
    itemId: string;
  }> {
    const actor = await service.resolveActor('u-e1', '张伟');
    const created = await service.createReport(actor, {
      purpose: '差旅报销',
      items: [
        {
          categoryId: 'c1',
          expenseDate: '2026-08-05',
          amount: 800,
          description: '往返高铁',
        },
      ],
    });
    return {
      actor,
      reportId: created.report.id,
      itemId: created.items[0]!.id,
    };
  }

  it('stores each sample with its real bytes and a usable preview kind', async () => {
    const cases = [
      { path: PNG, ext: 'png', mime: 'image/png', kind: 'image' },
      { path: PDF, ext: 'pdf', mime: 'application/pdf', kind: 'pdf' },
      { path: TXT, ext: 'txt', mime: 'text/plain', kind: 'text' },
    ] as const;
    for (const sample of cases) {
      const original = readFileSync(sample.path);
      const fileId = await upload(sample.path);
      const row = await database
        .query()
        .selectFrom('expenseFiles')
        .selectAll()
        .where('id', '=', fileId)
        .executeTakeFirst<{
          ext: string;
          mimeType: string;
          size: number | string;
        }>();
      expect(row?.ext).toBe(sample.ext);
      expect(row?.mimeType).toBe(sample.mime);
      expect(Number(row?.size)).toBe(original.length);
      // The bytes on the disk are identical to the uploaded original.
      expect(Buffer.compare(await storedBytes(fileId), original)).toBe(0);
      // Every sample resolves to a real in-page preview, not a download stub.
      expect(
        resolvePreviewKind({
          id: fileId,
          filename: path.basename(sample.path),
          ext: sample.ext,
          mimeType: sample.mime,
          size: original.length,
          createdAt: new Date().toISOString(),
          contentUrl: '',
        }),
      ).toBe(sample.kind);
    }
  });

  it('reads the sample PDF as a real multi-page document', async () => {
    const fileId = await upload(PDF);
    const bytes = await storedBytes(fileId);
    const pdfjs =
      (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as {
        getDocument(input: { data: Uint8Array }): {
          promise: Promise<{
            numPages: number;
            getPage(page: number): Promise<{
              getTextContent(): Promise<{ items: { str?: string }[] }>;
            }>;
          }>;
        };
      };
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) })
      .promise;
    expect(doc.numPages).toBe(2);
    const page1 = await doc.getPage(1);
    const page2 = await doc.getPage(2);
    const text1 = (await page1.getTextContent()).items
      .map((item) => item.str ?? '')
      .join(' ');
    const text2 = (await page2.getTextContent()).items
      .map((item) => item.str ?? '')
      .join(' ');
    expect(text1).toContain('page 1');
    expect(text2).toContain('page 2');
  });

  it('reads the sample text note directly', async () => {
    const fileId = await upload(TXT);
    const text = (await storedBytes(fileId)).toString('utf8');
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain('fictional');
  });

  describe('content access guard over real bytes', () => {
    let app: Hono<AuthEnv>;

    beforeEach(() => {
      app = new Hono<AuthEnv>();
      app.use('*', async (context, next) => {
        const userId = context.req.header('x-test-user');
        context.set(
          'auth',
          userId ? ({ user: { id: userId, name: userId } } as never) : null,
        );
        await next();
      });
      app.use(
        '/expense-files/*',
        async (context, next) => {
          if (!context.get('auth')) {
            return context.json({ code: 'UNAUTHORIZED' }, 401);
          }
          await next();
        },
        createExpenseFileAccessMiddleware(service),
      );
      // Mirrors the File Repository's stream mode: the guard runs first and the
      // handler serves the stored original bytes.
      app.get('/expense-files/:file', async (context) => {
        const fileId = (context.req.path.split('/').pop() ?? '').replace(
          /\.[a-z0-9]+$/i,
          '',
        );
        return context.body(new Uint8Array(await storedBytes(fileId)), 200, {
          'content-type': 'application/octet-stream',
        });
      });
    });

    async function requestAs(
      fileId: string,
      ext: string,
      userId?: string,
    ): Promise<Response> {
      return app.request(
        `/expense-files/${fileId}.${ext}`,
        userId ? { headers: { 'x-test-user': userId } } : undefined,
      );
    }

    it('serves the identical bytes only to the people who may see the report', async () => {
      const { actor, reportId, itemId } = await draftReport();
      const fileId = await upload(PNG);
      const original = readFileSync(PNG);
      await service.linkItemFile(actor, reportId, itemId, fileId);
      await service.submitReport(actor, reportId);

      expect((await requestAs(fileId, 'png')).status).toBe(401);

      const owner = await requestAs(fileId, 'png', 'u-e1');
      expect(owner.status).toBe(200);
      expect(
        Buffer.compare(Buffer.from(await owner.arrayBuffer()), original),
      ).toBe(0);

      const manager = await requestAs(fileId, 'png', 'u-mgr1');
      expect(manager.status).toBe(200);

      const otherDepartment = await requestAs(fileId, 'png', 'u-mgr2');
      expect(otherDepartment.status).toBe(403);
      const colleague = await requestAs(fileId, 'png', 'u-e2');
      expect(colleague.status).toBe(403);
      const finance = await requestAs(fileId, 'png', 'u-fin');
      expect(finance.status).toBe(403);

      const reviewer = await service.resolveActor('u-mgr1', '王强');
      await service.approveReport(reviewer, reportId);
      const financeAfterApproval = await requestAs(fileId, 'png', 'u-fin');
      expect(financeAfterApproval.status).toBe(200);
      expect(
        Buffer.compare(
          Buffer.from(await financeAfterApproval.arrayBuffer()),
          original,
        ),
      ).toBe(0);
    });

    it('stops serving a file once it is removed from an editable draft', async () => {
      const { actor, reportId, itemId } = await draftReport();
      const fileId = await upload(PNG);
      await service.linkItemFile(actor, reportId, itemId, fileId);
      expect((await requestAs(fileId, 'png', 'u-e1')).status).toBe(200);
      await service.removeFile(actor, fileId);
      expect((await requestAs(fileId, 'png', 'u-e1')).status).toBe(403);
      expect(await errorCode(() => service.removeFile(actor, fileId))).toBe(
        'NOT_FOUND',
      );
    });
  });

  it('uploads a batch of five files and keeps every address distinct', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const bytes = readFileSync(TXT);
    const files = Array.from(
      { length: 5 },
      (_, index) =>
        new File(
          [new Uint8Array(Buffer.concat([bytes, Buffer.from(`\n#${index}`)]))],
          `note-${index}.txt`,
          { type: 'text/plain' },
        ),
    );
    const batch = await repository.uploadMany({ files });
    expect(batch.records).toHaveLength(5);
    const ids = new Set(batch.records.map((record) => record.id));
    expect(ids.size).toBe(5);
    for (const record of batch.records) {
      await service.linkReportFile(actor, reportId, record.id);
    }
    const detail = await service.getReport(actor, reportId);
    expect(detail.files).toHaveLength(5);
    expect(new Set(detail.files.map((file) => file.contentUrl)).size).toBe(5);
    // Each stored file still carries its own bytes, so nothing is mixed up.
    for (const record of batch.records) {
      const stored = (await storedBytes(record.id)).toString('utf8');
      const index = record.filename.replace(/\D/g, '');
      expect(stored).toContain(`#${index}`);
    }
    // The item receipt count stays independent of the report supplements.
    expect(detail.items[0]!.id).toBe(itemId);
    expect(detail.items[0]!.files).toHaveLength(0);
  });

  it('keeps an unlinked upload private and serves it after a fresh session', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const fileId = await upload(TXT);
    // Nothing links it yet, so only the uploader may read it.
    expect(await service.canAccessFile(actor, fileId)).toBe(true);
    const colleague = await service.resolveActor('u-e2', '刘洋');
    expect(await service.canAccessFile(colleague, fileId)).toBe(false);

    const linked = await service.linkItemFile(actor, reportId, itemId, fileId);
    const url = linked.items[0]!.files[0]!.contentUrl;
    await service.submitReport(actor, reportId);

    // A new sign-in resolves a fresh actor and a fresh read; the stored address
    // and its bytes are unchanged.
    const returning = await service.resolveActor('u-e1', '张伟');
    const reread = await service.getReport(returning, reportId);
    expect(reread.items[0]!.files[0]!.contentUrl).toBe(url);
    expect(await service.canAccessFile(returning, fileId)).toBe(true);
    expect(Buffer.compare(await storedBytes(fileId), readFileSync(TXT))).toBe(
      0,
    );
  });
});
