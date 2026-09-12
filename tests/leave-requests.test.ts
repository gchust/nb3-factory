// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseManager } from '@nocobase/db';
import { createDatabaseManager } from '@nocobase/db';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import { createDriveManager } from '@nocobase/drive';
import type { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import { ServerFileRepositoryManager as RealServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { Hono } from 'hono';
import {
  leaveRequestApiRoutes,
  leaveEvidenceContentRoutes,
} from '../server/routes/leave-requests.js';
import {
  createLeaveRequestService,
  leaveRequestServiceToken,
  type LeaveRequestActor,
  type LeaveRequestService,
} from '../server/providers/leave-requests.js';

const migrationsDirectory = fileURLToPath(
  new URL('../database/main/migrations', import.meta.url),
);
const seedsDirectory = fileURLToPath(
  new URL('../database/main/seeds', import.meta.url),
);

const actor: LeaveRequestActor = { id: 7, name: '测试用户' };
const approver: LeaveRequestActor = { id: 9, name: '审批人' };

interface TestHarness {
  database: DatabaseManager;
  drive: NocoBaseDriveManager;
  files: ServerFileRepositoryManager;
  service: LeaveRequestService;
  api: Hono;
  content: Hono;
  signedIn: { value: boolean };
  cleanup(): Promise<void>;
}

async function createHarness(options?: {
  migrate?: boolean;
}): Promise<TestHarness> {
  const dir = mkdtempSync(join(tmpdir(), 'leave-test-'));
  mkdirSync(join(dir, 'storage'), { recursive: true });
  const database = createDatabaseManager({
    connections: {
      main: { dialect: 'sqlite', filename: join(dir, 'db.sqlite') },
    },
  });
  await database.connect('main');
  if (options?.migrate !== false) {
    const migrator = database.createMigrator({
      directory: migrationsDirectory,
      connection: 'main',
    });
    await migrator.latest();
  }

  const drive = createDriveManager({
    default: 'local',
    disks: {
      local: {
        driver: 'fs',
        location: join(dir, 'storage'),
        visibility: 'private',
      },
    },
  });
  const files = new RealServerFileRepositoryManager(database, drive);
  const service = createLeaveRequestService(database, files, drive);

  const authenticated = { value: true };
  const auth = {
    required() {
      return async (
        context: { set(key: string, value: unknown): void },
        next: () => Promise<void>,
      ) => {
        if (!authenticated.value) {
          return new Response(
            JSON.stringify({
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          );
        }
        context.set('auth', {
          user: { id: actor.id, name: actor.name, email: 'user@example.com' },
          session: { id: 'session-1' },
        });
        await next();
      };
    },
  };

  const container = {
    resolve(token: unknown): unknown {
      if (token === authenticationToken) return auth;
      if (token === leaveRequestServiceToken) return service;
      if (token === serverFileRepositoryManagerToken) return files;
      if (token === driveManagerToken) return drive;
      throw new Error(`Unexpected service token: ${String(token)}`);
    },
  };

  const app = { container, publicBasePath: '' };
  return {
    database,
    drive,
    files,
    service,
    api: leaveRequestApiRoutes.createRouter(app) as Hono,
    content: leaveEvidenceContentRoutes.createRouter(app) as Hono,
    signedIn: authenticated,
    async cleanup() {
      authenticated.value = true;
      await database.disconnect('main');
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('leave-request migrations', () => {
  it('applies up and rolls back down to an empty schema', async () => {
    const { database, cleanup } = await createHarness();
    try {
      const tableNames = async (): Promise<string[]> =>
        database
          .query()
          .selectFrom('sqlite_master')
          .select('name')
          .where('type', '=', 'table')
          .execute()
          .then((rows) => rows.map((row) => String(row.name)));
      await expect(tableNames()).resolves.toContain('leave_requests');
      await expect(tableNames()).resolves.toContain('leave_evidence_files');
      const migrator = database.createMigrator({
        directory: migrationsDirectory,
        connection: 'main',
      });
      const rollback = await migrator.rollback();
      expect(rollback.rolledBack).toEqual([
        '202609140001_allow_nullable_account_issuer',
        '202609130002_create_leave_evidence_files',
        '202609130001_create_leave_requests',
      ]);
      await expect(tableNames()).resolves.not.toContain('leave_requests');
      await expect(tableNames()).resolves.not.toContain('leave_evidence_files');
    } finally {
      await cleanup();
    }
  });

  it('keeps the immutable migration sources versioned and ordered', async () => {
    const names = [
      '202609130001_create_leave_requests',
      '202609130002_create_leave_evidence_files',
      '202609140001_allow_nullable_account_issuer',
    ];
    const { database, cleanup } = await createHarness({ migrate: false });
    try {
      const migrator = database.createMigrator({
        directory: migrationsDirectory,
        connection: 'main',
      });
      const run = await migrator.latest();
      expect(run.executed).toEqual(names);
    } finally {
      await cleanup();
    }
  });
});

describe('leave-request seeds', () => {
  it('seeds all statuses across applicants and is idempotent', async () => {
    const { database, cleanup } = await createHarness();
    try {
      const seeder = database.createSeeder({
        directory: seedsDirectory,
        connection: 'main',
      });
      const first = await seeder.run();
      expect(first.executed).toContain('202609130003_seed_leave_requests');

      const rows = await database
        .query()
        .selectFrom('leaveRequests')
        .selectAll()
        .execute();
      expect(rows.length).toBeGreaterThanOrEqual(4);
      const statuses = new Set(rows.map((row) => String(row.status)));
      expect(statuses).toEqual(new Set(['pending', 'approved', 'rejected']));
      const applicants = new Set(rows.map((row) => String(row.applicantName)));
      expect(applicants.size).toBeGreaterThanOrEqual(2);

      const second = await seeder.run();
      expect(second.executed).not.toContain('202609130003_seed_leave_requests');
      const after = await database
        .query()
        .selectFrom('leaveRequests')
        .selectAll()
        .execute();
      expect(after.length).toBe(rows.length);
    } finally {
      await cleanup();
    }
  });
});

describe('leave-request service', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });
  afterEach(async () => {
    await harness.cleanup();
  });

  it('creates a pending request and lists it with an evidence count', async () => {
    const { service } = harness;
    const created = await service.create(
      {
        type: 'annual',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        days: 3,
        reason: '回家探亲',
      },
      actor,
    );
    expect(created.id).toBeGreaterThan(0);
    expect(created.status).toBe('pending');
    expect(created.applicantName).toBe(actor.name);
    expect(created.evidenceCount).toBe(0);

    const list = await service.list();
    expect(list.some((request) => request.id === created.id)).toBe(true);
    const listed = list.find((request) => request.id === created.id);
    expect(listed?.evidenceCount).toBe(0);
  });

  it('approves with a comment and records the approver; a second attempt fails', async () => {
    const { service } = harness;
    const created = await service.create(
      {
        type: 'personal',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 86_400_000).toISOString(),
        days: 1,
        reason: '家中有事',
      },
      actor,
    );
    const approved = await service.approve(
      created.id,
      '同意，注意休息。',
      approver,
    );
    expect(approved.status).toBe('approved');
    expect(approved.approvalComment).toBe('同意，注意休息。');
    expect(approved.approvedByName).toBe(approver.name);
    expect(approved.approvedById).toBe(approver.id);
    expect(approved.approvedAt).toBeTruthy();

    await expect(
      service.approve(created.id, '重复审批', approver),
    ).rejects.toMatchObject({
      code: 'ALREADY_PROCESSED',
      status: 'approved',
    });
    await expect(
      service.reject(created.id, '已通过', approver),
    ).rejects.toMatchObject({
      code: 'ALREADY_PROCESSED',
      status: 'approved',
    });
  });

  it('rejects a pending request and rejects an unknown id', async () => {
    const { service } = harness;
    const created = await service.create(
      {
        type: 'sick',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        days: 2,
        reason: '感冒发烧',
      },
      actor,
    );
    const rejected = await service.reject(created.id, '材料不完整', approver);
    expect(rejected.status).toBe('rejected');
    expect(rejected.approvalComment).toBe('材料不完整');

    await expect(service.approve(99_999, 'ok', approver)).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );
  });

  it('uploads evidence to a request and deletes only its own files', async () => {
    const { service, drive } = harness;
    const first = await service.create(
      {
        type: 'annual',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 86_400_000).toISOString(),
        days: 1,
        reason: '年假',
      },
      actor,
    );
    const second = await service.create(
      {
        type: 'personal',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 86_400_000).toISOString(),
        days: 1,
        reason: '事假',
      },
      actor,
    );

    const [fileA, fileB] = await service.uploadEvidence(first.id, [
      new File(['content-a'], 'a.txt', { type: 'text/plain' }),
      new File(['content-b'], 'b.txt', { type: 'text/plain' }),
    ]);
    const [fileC] = await service.uploadEvidence(second.id, [
      new File(['content-c'], 'c.txt', { type: 'text/plain' }),
    ]);

    expect(fileA.leaveRequestId).toBe(first.id);
    expect(fileC.leaveRequestId).toBe(second.id);
    const detail = await service.get(first.id);
    expect(detail?.evidenceCount).toBe(2);

    // A request may only delete its own evidence.
    await expect(
      service.deleteEvidence(first.id, fileC.id),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.deleteEvidence(99_999, fileA.id),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await service.deleteEvidence(first.id, fileA.id);
    const disk = drive.use('local');
    await expect(disk.exists(fileA.key)).resolves.toBe(false);
    const after = await service.get(first.id);
    expect(after?.evidenceCount).toBe(1);
    expect(after?.evidenceFiles.map((file) => file.id)).toEqual([fileB.id]);
  });
});

describe('leave-request API routes', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });
  afterEach(async () => {
    await harness.cleanup();
  });

  const json = async (response: Response): Promise<Record<string, unknown>> =>
    (await response.json()) as Record<string, unknown>;

  it('rejects anonymous requests on the API and content routes', async () => {
    const { api, content, signedIn } = harness;
    signedIn.value = false;

    const unauth = await api.request('/leave-requests');
    expect(unauth.status).toBe(401);
    await expect(json(unauth)).resolves.toMatchObject({ code: 'UNAUTHORIZED' });

    const contentRes = await content.request(
      '/uploads/leave-evidence/missing.txt',
    );
    expect(contentRes.status).toBe(401);
  });

  it('creates, lists and reads a request', async () => {
    const { api, service } = harness;
    const created = await service.create(
      {
        type: 'compensatory',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        days: 1.5,
        reason: '调休',
      },
      actor,
    );

    const list = await api.request('/leave-requests');
    expect(list.status).toBe(200);
    const listBody = (await json(list)) as { data: Array<{ id: number }> };
    expect(listBody.data.some((item) => item.id === created.id)).toBe(true);

    const detail = await api.request(`/leave-requests/${created.id}`);
    expect(detail.status).toBe(200);
    const detailBody = (await json(detail)) as {
      data: { status: string; days: number };
    };
    expect(detailBody.data.status).toBe('pending');
    expect(detailBody.data.days).toBe(1.5);

    const missing = await api.request('/leave-requests/999999');
    expect(missing.status).toBe(404);
    await expect(json(missing)).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects invalid creation payloads', async () => {
    const { api } = harness;
    const bad = await api.request('/leave-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'unknown', startAt: 'nope' }),
    });
    expect(bad.status).toBe(400);
    await expect(json(bad)).resolves.toMatchObject({ code: 'INVALID_INPUT' });

    const malformed = await api.request('/leave-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(malformed.status).toBe(400);
  });

  it('creates via POST and returns the decorated request', async () => {
    const { api } = harness;
    const response = await api.request('/leave-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'sick',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        days: 2,
        reason: '医院复查',
      }),
    });
    expect(response.status).toBe(201);
    const body = (await json(response)) as {
      data: { id: number; status: string; applicantName: string };
    };
    expect(body.data.status).toBe('pending');
    expect(body.data.applicantName).toBe(actor.name);
  });

  it('approves once and returns 409 on a second attempt', async () => {
    const { api, service } = harness;
    const created = await service.create(
      {
        type: 'annual',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 86_400_000).toISOString(),
        days: 1,
        reason: '年假',
      },
      actor,
    );

    const missingComment = await api.request(
      `/leave-requests/${created.id}/approve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ comment: '   ' }),
      },
    );
    expect(missingComment.status).toBe(400);
    await expect(json(missingComment)).resolves.toMatchObject({
      code: 'INVALID_INPUT',
    });

    const approved = await api.request(
      `/leave-requests/${created.id}/approve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ comment: '同意' }),
      },
    );
    expect(approved.status).toBe(200);
    const body = (await json(approved)) as {
      data: { status: string; approvedByName: string };
    };
    expect(body.data.status).toBe('approved');
    expect(body.data.approvedByName).toBe(actor.name);

    const again = await api.request(`/leave-requests/${created.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ comment: '再来一次' }),
    });
    expect(again.status).toBe(409);
    const againBody = (await json(again)) as { code: string; status: string };
    expect(againBody.code).toBe('ALREADY_PROCESSED');
    expect(againBody.status).toBe('approved');
  });

  it('requires multipart for uploads and accepts real files', async () => {
    const { api, service, drive } = harness;
    const created = await service.create(
      {
        type: 'personal',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 86_400_000).toISOString(),
        days: 1,
        reason: '事假',
      },
      actor,
    );

    const notMultipart = await api.request(
      `/leave-requests/${created.id}/evidence/upload`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file: 'x' }),
      },
    );
    expect(notMultipart.status).toBe(415);
    await expect(json(notMultipart)).resolves.toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });

    const form = new FormData();
    form.append(
      'file',
      new File(['proof-bytes'], '证明.txt', { type: 'text/plain' }),
    );
    const uploaded = await api.request(
      `/leave-requests/${created.id}/evidence/upload`,
      {
        method: 'POST',
        body: form,
      },
    );
    expect(uploaded.status).toBe(201);
    const body = (await json(uploaded)) as {
      data: Array<{
        id: string;
        filename: string;
        leaveRequestId: number;
        contentUrl: string;
      }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].filename).toBe('证明.txt');
    expect(body.data[0].leaveRequestId).toBe(created.id);
    expect(body.data[0].contentUrl).toContain('/uploads/leave-evidence/');

    const record = await service.findEvidenceById(body.data[0].id);
    const disk = drive.use('local');
    await expect(disk.exists(record?.key ?? '')).resolves.toBe(true);
  });

  it('deletes evidence per request through the API', async () => {
    const { api, service } = harness;
    const first = await service.create(
      {
        type: 'annual',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 86_400_000).toISOString(),
        days: 1,
        reason: '年假',
      },
      actor,
    );
    const second = await service.create(
      {
        type: 'sick',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 86_400_000).toISOString(),
        days: 1,
        reason: '病假',
      },
      actor,
    );
    const form = new FormData();
    form.append('file', new File(['bytes'], 'doc.txt', { type: 'text/plain' }));
    const uploaded = (await (
      await api.request(`/leave-requests/${first.id}/evidence/upload`, {
        method: 'POST',
        body: form,
      })
    ).json()) as { data: Array<{ id: string }> };
    const evidenceId = uploaded.data[0].id;

    const foreign = await api.request(
      `/leave-requests/${second.id}/evidence/${evidenceId}`,
      {
        method: 'DELETE',
      },
    );
    expect(foreign.status).toBe(404);

    const own = await api.request(
      `/leave-requests/${first.id}/evidence/${evidenceId}`,
      {
        method: 'DELETE',
      },
    );
    expect(own.status).toBe(200);
    const detail = await service.get(first.id);
    expect(detail?.evidenceCount).toBe(0);

    const invalidId = await api.request(
      `/leave-requests/${first.id}/evidence/not-a-uuid`,
      {
        method: 'DELETE',
      },
    );
    expect(invalidId.status).toBe(400);
  });

  it('serves evidence bytes with the right filename and rejects mismatches', async () => {
    const { api, service, content } = harness;
    const created = await service.create(
      {
        type: 'annual',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 86_400_000).toISOString(),
        days: 1,
        reason: '年假',
      },
      actor,
    );
    const form = new FormData();
    form.append(
      'file',
      new File(['hello evidence bytes'], 'cert.pdf', {
        type: 'application/pdf',
      }),
    );
    const uploaded = (await (
      await api.request(`/leave-requests/${created.id}/evidence/upload`, {
        method: 'POST',
        body: form,
      })
    ).json()) as { data: Array<{ id: string; ext: string }> };
    const record = uploaded.data[0];

    const served = await content.request(
      `/uploads/leave-evidence/${record.id}.${record.ext}`,
    );
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('application/pdf');
    await expect(served.arrayBuffer()).resolves.toEqual(
      new TextEncoder().encode('hello evidence bytes').buffer,
    );
    expect(served.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''cert.pdf",
    );

    const wrongExt = await content.request(
      `/uploads/leave-evidence/${record.id}.jpg`,
    );
    expect(wrongExt.status).toBe(404);
    const bare = await content.request(`/uploads/leave-evidence/${record.id}`);
    expect(bare.status).toBe(404);
    const garbage = await content.request(
      '/uploads/leave-evidence/not-a-file.txt',
    );
    expect(garbage.status).toBe(404);
  });
});
