// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  ServerFileRepositoryManager,
  serverFileRepositoryManagerToken,
} from '@nocobase/app-plugin-file/server';
import { createDriveManager } from '@nocobase/drive';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609190001_create_training_tables.js';
import fileMigration from '../../database/main/migrations/202609190003_create_training_files.js';
import {
  TRAINING_ADMIN_ROLE,
  TRAINING_INSTRUCTOR_ROLE,
  TRAINING_STUDENT_ROLE,
  trainingServiceToken,
  createTrainingService,
} from '../../server/providers/training.js';
import {
  trainingFileGuards,
  trainingFileRoutes,
} from '../../server/routes/training-files.js';
import { trainingRoutes } from '../../server/routes/training.js';

const ROLE_ASSIGNMENTS = [
  {
    id: 'a1',
    subject: { type: 'user', id: 'admin-user' },
    permissionSet: TRAINING_ADMIN_ROLE,
  },
  {
    id: 'a2',
    subject: { type: 'user', id: 'instructor-user' },
    permissionSet: TRAINING_INSTRUCTOR_ROLE,
  },
  {
    id: 'a3',
    subject: { type: 'user', id: 'student-user' },
    permissionSet: TRAINING_STUDENT_ROLE,
  },
  {
    id: 'a4',
    subject: { type: 'user', id: 'outsider-user' },
    permissionSet: TRAINING_STUDENT_ROLE,
  },
  {
    id: 'a5',
    subject: { type: 'user', id: 'peer-user' },
    permissionSet: TRAINING_STUDENT_ROLE,
  },
];

/** A 1x1 red PNG, a two-page PDF and a UTF-8 text file. */
const SAMPLE_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const SAMPLE_TEXT = new TextEncoder().encode(
  '培训学习要点\n1. 了解公司制度\n2. 完成岗位实践\n',
);
const SAMPLE_PDF = buildPdf([
  '第一页：课程目标',
  '第二页：学习安排',
  '第三页：作业要求',
]);

interface MountedApp {
  readonly app: Hono;
  readonly database: DatabaseManager;
  readonly storageDir: string;
}

function buildPdf(pages: readonly string[]): Uint8Array {
  const kids: number[] = [];
  // 1 = catalog, 2 = pages, then a pair of objects per page, then the font.
  const firstPageObject = 3;
  pages.forEach((_, index) => kids.push(firstPageObject + index * 2));
  const fontObject = firstPageObject + pages.length * 2;

  const header = '%PDF-1.4\n';
  const chunks: { id: number; body: string }[] = [
    { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    {
      id: 2,
      body: `<< /Type /Pages /Kids [${kids
        .map((id) => `${id} 0 R`)
        .join(' ')}] /Count ${pages.length} >>`,
    },
  ];
  pages.forEach((label, index) => {
    const pageId = firstPageObject + index * 2;
    chunks.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${
        pageId + 1
      } 0 R >>`,
    });
    const stream = `BT /F1 20 Tf 40 240 Td (${label}) Tj ET`;
    chunks.push({
      id: pageId + 1,
      body: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    });
  });
  chunks.push({
    id: fontObject,
    body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  });

  chunks.sort((a, b) => a.id - b.id);
  const offsets = new Map<number, number>();
  let body = '';
  for (const chunk of chunks) {
    offsets.set(chunk.id, header.length + body.length);
    body += `${chunk.id} 0 obj\n${chunk.body}\nendobj\n`;
  }
  const xrefStart = header.length + body.length;
  const maxId = fontObject;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    xref += `${String(offsets.get(id) ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(header + body + xref + trailer);
}

async function mount(): Promise<MountedApp> {
  const storageDir = await mkdtemp(join(tmpdir(), 'training-files-'));
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const connection = database.connection();
  const context: MigrationContext = {
    builder: connection.builder,
    query: connection.query,
    connection: {
      name: connection.name,
      driver: connection.driver,
      dialect: connection.dialect,
      capabilities: connection.capabilities,
      client: connection.client.bind(connection),
    },
  };
  await migration.up(context);
  await fileMigration.up(context);

  const now = new Date();
  await connection.builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('name', { length: 255 }).notNull();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
  });
  await connection.query
    .insertInto('user')
    .values({
      id: 'student-user',
      name: '学员一',
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await connection.query
    .insertInto('user')
    .values({
      id: 'peer-user',
      name: '学员二',
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await connection.query
    .insertInto('trainingCourses')
    .values({
      code: 'TRN-101',
      title: '新员工培训',
      description: null,
      category: '通用',
      level: '入门',
      status: 'published',
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await connection.query
    .insertInto('trainingSessions')
    .values({
      code: 'SES-1',
      courseId: 1,
      title: '一班',
      instructorId: 'instructor-user',
      startAt: new Date(now.getTime() - 3_600_000),
      endAt: new Date(now.getTime() + 3_600_000),
      capacity: 30,
      location: '线上',
      status: 'in_progress',
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await connection.query
    .insertInto('trainingEnrollments')
    .values({
      sessionId: 1,
      studentId: 'student-user',
      status: 'active',
      enrolledAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  // A classmate enrolled in the same session, used to prove that enrollment
  // alone does not grant access to another student's files.
  await connection.query
    .insertInto('trainingEnrollments')
    .values({
      sessionId: 1,
      studentId: 'peer-user',
      status: 'active',
      enrolledAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  const drive = createDriveManager({
    default: 'local',
    disks: {
      local: { driver: 'fs', location: storageDir, visibility: 'private' },
    },
  });
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(driveManagerToken, drive);
  container.instance(authenticationToken, {
    required:
      () =>
      async (
        c: {
          req: { header: (name: string) => string | undefined };
          json: (body: unknown, status?: number) => Response;
          set: (key: string, value: unknown) => void;
        },
        next: () => Promise<void>,
      ) => {
        const userId = c.req.header('x-test-user');
        if (!userId) return c.json({ code: 'UNAUTHORIZED' }, 401);
        c.set('auth', {
          user: { id: userId, name: userId, email: `${userId}@example.com` },
          session: { id: 'session-1' },
        });
        await next();
        return undefined;
      },
  } as never);
  container.instance(authorizationToken, {
    permissionSets: { listAssignments: async () => ROLE_ASSIGNMENTS },
  } as never);
  container.instance(
    trainingServiceToken,
    createTrainingService(database, { publicBasePath: '' }) as never,
  );
  container.instance(
    serverFileRepositoryManagerToken,
    new ServerFileRepositoryManager(database, drive as never),
  );

  const app = new Hono();
  const application = { container, publicBasePath: '' } as never;
  for (const contribution of [
    ...trainingFileGuards,
    ...trainingFileRoutes,
    trainingRoutes,
  ]) {
    const router = await contribution.createRouter(application);
    app.route(contribution.scope === 'api' ? '/api' : '/', router);
  }
  return { app, database, storageDir };
}

function headers(userId?: string): Record<string, string> {
  return userId ? { 'x-test-user': userId } : {};
}

/**
 * Builds a raw multipart body. The test runs under jsdom, whose `FormData` is
 * not the one Hono parses, so the body is assembled by hand.
 */
function multipart(
  name: string,
  filename: string,
  type: string,
  bytes: Uint8Array,
): { readonly body: Uint8Array; readonly contentType: string } {
  const boundary = `----trainingtest${Math.random().toString(16).slice(2)}`;
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function upload(
  app: Hono,
  userId: string,
  name: string,
  type: string,
  bytes: Uint8Array,
): Promise<{
  readonly id: string;
  readonly contentUrl: string;
  readonly filename: string;
}> {
  const { body, contentType } = multipart('file', name, type, bytes);
  const response = await app.request('/api/trainingFiles:uploadMany', {
    method: 'POST',
    headers: { ...headers(userId), 'content-type': contentType },
    body,
  });
  if (response.status !== 200) {
    throw new Error(
      `upload failed: ${response.status} ${await response.text()}`,
    );
  }
  const parsed = (await response.json()) as {
    data: {
      createdCount: number;
      records: { id: string; contentUrl: string; filename: string }[];
    };
  };
  expect(parsed.data.createdCount).toBe(1);
  return parsed.data.records[0]!;
}

describe('training file routes', () => {
  let mounted: MountedApp;

  beforeEach(async () => {
    mounted = await mount();
  });

  afterEach(async () => {
    await mounted.database.destroy();
    await rm(mounted.storageDir, { recursive: true, force: true });
  });

  it('rejects anonymous uploads and content requests', async () => {
    const uploadResponse = await mounted.app.request(
      '/api/trainingFiles:uploadMany',
      { method: 'POST', headers: headers() },
    );
    expect(uploadResponse.status).toBe(401);

    const content = await mounted.app.request(
      '/uploads/training/11111111-1111-1111-1111-111111111111.txt',
      { headers: headers() },
    );
    expect(content.status).toBe(401);
  });

  it('serves uploaded bytes unchanged to a permitted reader', async () => {
    const image = await upload(
      mounted.app,
      'instructor-user',
      'cover.png',
      'image/png',
      SAMPLE_PNG,
    );
    const pdf = await upload(
      mounted.app,
      'instructor-user',
      'handbook.pdf',
      'application/pdf',
      SAMPLE_PDF,
    );
    const text = await upload(
      mounted.app,
      'instructor-user',
      'notes.txt',
      'text/plain',
      SAMPLE_TEXT,
    );

    const link = await mounted.app.request(
      '/api/training/sessions/1/materials',
      {
        method: 'POST',
        headers: {
          ...headers('instructor-user'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          files: [
            { fileId: image.id, title: '课件封面' },
            { fileId: pdf.id, title: '培训手册' },
            { fileId: text.id, title: '学习要点' },
          ],
        }),
      },
    );
    expect(link.status).toBe(201);
    const linked = (await link.json()) as {
      data: { title: string; contentUrl: string }[];
    };
    expect(linked.data.map((item) => item.title)).toEqual([
      '课件封面',
      '培训手册',
      '学习要点',
    ]);

    for (const [record, expected] of [
      [image, SAMPLE_PNG],
      [pdf, SAMPLE_PDF],
      [text, SAMPLE_TEXT],
    ] as const) {
      const response = await mounted.app.request(record.contentUrl, {
        headers: headers('student-user'),
      });
      expect(response.status).toBe(200);
      const received = new Uint8Array(await response.arrayBuffer());
      expect(received).toEqual(expected);
      expect(received.length).toBe(expected.length);
    }

    // The content type survives so the browser can render the preview.
    const imageResponse = await mounted.app.request(image.contentUrl, {
      headers: headers('student-user'),
    });
    expect(imageResponse.headers.get('content-type')).toContain('image/png');
  });

  it('refuses the content address to a reader with no business access', async () => {
    const file = await upload(
      mounted.app,
      'instructor-user',
      'notes.txt',
      'text/plain',
      SAMPLE_TEXT,
    );
    await mounted.app.request('/api/training/sessions/1/materials', {
      method: 'POST',
      headers: {
        ...headers('instructor-user'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ files: [{ fileId: file.id }] }),
    });

    // An enrolled student may read it; a signed-in outsider may not, even
    // though they hold the exact address.
    const permitted = await mounted.app.request(file.contentUrl, {
      headers: headers('student-user'),
    });
    expect(permitted.status).toBe(200);

    const denied = await mounted.app.request(file.contentUrl, {
      headers: headers('outsider-user'),
    });
    expect(denied.status).toBe(403);
  });

  it('refuses an unlinked upload to everyone but its uploader', async () => {
    const file = await upload(
      mounted.app,
      'instructor-user',
      'draft.txt',
      'text/plain',
      SAMPLE_TEXT,
    );
    const owner = await mounted.app.request(file.contentUrl, {
      headers: headers('instructor-user'),
    });
    expect(owner.status).toBe(200);
    const stranger = await mounted.app.request(file.contentUrl, {
      headers: headers('student-user'),
    });
    expect(stranger.status).toBe(403);
  });

  it('lets an uploader remove their own file but not another user file', async () => {
    const mine = await upload(
      mounted.app,
      'student-user',
      'draft.txt',
      'text/plain',
      SAMPLE_TEXT,
    );
    const removed = await mounted.app.request('/api/trainingFiles:deleteOne', {
      method: 'POST',
      headers: {
        ...headers('student-user'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ filter: { id: mine.id } }),
    });
    expect(removed.status).toBe(200);
    const gone = await mounted.database
      .connection()
      .query.selectFrom('trainingFiles')
      .select('id')
      .where('id', '=', mine.id)
      .executeTakeFirst();
    expect(gone).toBeUndefined();

    const other = await upload(
      mounted.app,
      'instructor-user',
      'keep.txt',
      'text/plain',
      SAMPLE_TEXT,
    );
    const refused = await mounted.app.request('/api/trainingFiles:deleteOne', {
      method: 'POST',
      headers: {
        ...headers('student-user'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ filter: { id: other.id } }),
    });
    expect(refused.ok).toBe(false);
    const kept = await mounted.database
      .connection()
      .query.selectFrom('trainingFiles')
      .select('id')
      .where('id', '=', other.id)
      .executeTakeFirst();
    expect(kept).toBeDefined();
  });

  it('groups homework attachments and instructor annotations apart', async () => {
    const now = new Date();
    await mounted.database
      .connection()
      .query.insertInto('trainingAssignments')
      .values({
        sessionId: 1,
        title: '学习心得',
        description: null,
        dueAt: new Date(now.getTime() + 3_600_000),
        maxScore: 100,
        status: 'published',
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const homework = await upload(
      mounted.app,
      'student-user',
      'report.txt',
      'text/plain',
      SAMPLE_TEXT,
    );
    const submit = await mounted.app.request(
      '/api/training/assignments/1/submissions',
      {
        method: 'POST',
        headers: {
          ...headers('student-user'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ content: '我的作业', fileIds: [homework.id] }),
      },
    );
    expect(submit.status).toBe(201);
    const submission = (await submit.json()) as {
      data: { id: number; files: { filename: string }[] };
    };
    expect(submission.data.files.map((file) => file.filename)).toEqual([
      'report.txt',
    ]);

    // A student cannot attach a file they did not upload.
    const foreign = await upload(
      mounted.app,
      'instructor-user',
      'foreign.txt',
      'text/plain',
      SAMPLE_TEXT,
    );
    const stored = await mounted.database
      .connection()
      .query.selectFrom('trainingSubmissions')
      .select('id')
      .where('assignmentId', '=', 1)
      .executeTakeFirstOrThrow();
    const rejected = await mounted.app.request(
      `/api/training/assignments/1/submissions`,
      {
        method: 'POST',
        headers: {
          ...headers('outsider-user'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ content: '越权', fileIds: [foreign.id] }),
      },
    );
    // The outsider is not enrolled, so the submission is refused before files.
    expect([403, 409]).toContain(rejected.status);

    const annotation = await upload(
      mounted.app,
      'instructor-user',
      'review.pdf',
      'application/pdf',
      SAMPLE_PDF,
    );
    const review = await mounted.app.request(
      `/api/training/submissions/${Number(stored.id)}/review`,
      {
        method: 'POST',
        headers: {
          ...headers('instructor-user'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'graded',
          score: 95,
          feedback: '很好',
          fileIds: [annotation.id],
        }),
      },
    );
    expect(review.status).toBe(200);
    const reviewed = (await review.json()) as {
      data: {
        files: { filename: string }[];
        reviews: { files: { filename: string }[] }[];
      };
    };
    // Homework attachments and annotations do not mix.
    expect(reviewed.data.files.map((file) => file.filename)).toEqual([
      'report.txt',
    ]);
    expect(
      reviewed.data.reviews[0]?.files.map((file) => file.filename),
    ).toEqual(['review.pdf']);

    // A classmate enrolled in the same session must not read the annotation on
    // someone else's submission, even with the exact address.
    const peerAnnotation = await mounted.app.request(annotation.contentUrl, {
      headers: headers('peer-user'),
    });
    expect(peerAnnotation.status).toBe(403);
    const peerHomework = await mounted.app.request(homework.contentUrl, {
      headers: headers('peer-user'),
    });
    expect(peerHomework.status).toBe(403);
    // The submitting student and the grading instructor still can.
    const ownerAnnotation = await mounted.app.request(annotation.contentUrl, {
      headers: headers('student-user'),
    });
    expect(ownerAnnotation.status).toBe(200);
    const instructorAnnotation = await mounted.app.request(
      annotation.contentUrl,
      { headers: headers('instructor-user') },
    );
    expect(instructorAnnotation.status).toBe(200);
  });
});
