// @vitest-environment node
// These tests exercise the real Hono routers with real multipart and database I/O. jsdom replaces the global
// `File` with its own implementation, which the server's multipart parser rejects, so run them in Node.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { Auth } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  documentApiRoutes,
  documentContentRoutes,
} from '../../server/routes/documents.js';

type Decision = 'allow' | 'deny';

const migrationsDirectory = path.resolve(
  process.cwd(),
  'database/main/migrations',
);
const authenticationMigrationsDirectory = path.resolve(
  process.cwd(),
  'node_modules/@nocobase/app-plugin-authentication/dist/database/migrations',
);

const DOCUMENT_ID = '11111111-2222-4333-8444-555555555555';
const FILE_BYTES = Buffer.from('%PDF-1.4 test document');

const BOUNDARY = '----nb3-document-test-boundary';

interface MultipartPart {
  readonly name: string;
  readonly value?: string;
  readonly filename?: string;
  readonly contentType?: string;
  readonly data?: Buffer;
}

/**
 * Builds the multipart body by hand. The test runs in a jsdom environment whose `FormData`/`File` are not the
 * undici classes the server's parser expects, so a browser-style FormData object would not survive the round trip.
 */
function buildMultipart(parts: readonly MultipartPart[]): {
  readonly body: Buffer;
  readonly contentType: string;
} {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n`));
    if (part.filename !== undefined) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`,
        ),
      );
      chunks.push(
        Buffer.from(
          `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        ),
      );
      chunks.push(part.data ?? Buffer.alloc(0));
      chunks.push(Buffer.from('\r\n'));
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n`,
        ),
      );
      chunks.push(Buffer.from(part.value ?? ''));
      chunks.push(Buffer.from('\r\n'));
    }
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  };
}

describe('document routes', () => {
  let directory: string;
  let manager: DatabaseManager;
  let decisions: Record<string, Decision>;
  let stored: Map<string, Buffer>;

  const createFakeApp = (): Application => {
    const container = new ServiceContainer();

    const auth = {
      required: () => async (context: never, next: () => Promise<void>) => {
        const typed = context as unknown as {
          req: { header(name: string): string | undefined };
          set(key: string, value: unknown): void;
          json(value: unknown, status: number): Response;
        };
        const user = typed.req.header('x-test-user');
        if (!user) {
          return typed.json({ code: 'UNAUTHORIZED' }, 401);
        }
        typed.set('auth', { user: { id: user, name: user }, session: {} });
        await next();
      },
    } as unknown as Auth;
    container.instance(authenticationToken, auth);

    const authorization = {
      middleware: () => async (context: never, next: () => Promise<void>) => {
        const typed = context as unknown as {
          set(key: string, value: unknown): void;
        };
        typed.set('authz', {
          identity: {
            principal: { type: 'user', id: 'tester' },
            subjects: [],
          },
          authorize: async (request: { action: string }) =>
            decisions[request.action] === 'allow'
              ? {
                  effect: 'conditional',
                  conditions: {
                    type: 'database',
                    collection: 'main.documents',
                    action: request.action,
                    filter: { $and: [] },
                    fields: { input: '*', output: '*' },
                  },
                  reasons: [],
                }
              : { effect: 'deny', reasons: [] },
          can: async () => true,
          require: async () => undefined,
          explain: async () => ({ effect: 'deny', reasons: [] }),
          permissions: async () => ({ permissions: [] }),
        });
        await next();
      },
    } as unknown as AppAuthorization;
    container.instance(authorizationToken, authorization);

    container.instance(databaseManagerToken, manager);

    const disk = {
      exists: async (key: string) => stored.has(key),
      getStream: async (key: string) =>
        Readable.from(stored.get(key) ?? Buffer.alloc(0)),
    };
    // Named rather than an inline arrow: the property is `use`, which the hooks lint rule would otherwise read as a
    // custom hook.
    const selectDisk = (): typeof disk => disk;
    container.instance(driveManagerToken, { use: selectDisk } as never);

    // The upload route resolves the file repository manager; a denied request never reaches it.
    container.instance(serverFileRepositoryManagerToken, {
      repository: () => {
        throw new Error(
          'The file repository must not be reached in this test.',
        );
      },
    } as never);

    return { container, publicBasePath: '/main' } as unknown as Application;
  };

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'nb3-document-routes-'));
    manager = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: path.join(directory, 'test.sqlite'),
          schemaManagement: 'managed',
        },
      },
    });
    await manager
      .createMigrator({
        connection: 'main',
        sources: [
          { packageName: 'app', directory: migrationsDirectory },
          {
            packageName: '@nocobase/app-plugin-authentication',
            directory: authenticationMigrationsDirectory,
          },
        ],
      })
      .latest();

    decisions = {};
    stored = new Map();
    const key = `objects/${DOCUMENT_ID}.pdf`;
    stored.set(key, FILE_BYTES);
    await manager
      .query('main')
      .insertInto('documents')
      .values({
        id: DOCUMENT_ID,
        disk: 'local',
        key,
        filename: 'A-101-floor-plan.pdf',
        ext: 'pdf',
        mimeType: 'application/pdf',
        size: FILE_BYTES.byteLength,
        drawingNumber: 'A-101',
        name: 'A-101 floor plan',
        discipline: 'architecture',
        version: '1.0',
        status: 'active',
        uploadedById: 'clerk',
        uploadedByName: 'clerk',
        uploadedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
  });

  afterEach(async () => {
    await manager.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('rejects an anonymous list request', async () => {
    decisions.read = 'allow';
    const router = await documentApiRoutes.createRouter(createFakeApp());
    const response = await router.request('/document-library/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });

  it('refuses a read for a role without the read grant', async () => {
    decisions.read = 'deny';
    const router = await documentApiRoutes.createRouter(createFakeApp());
    const response = await router.request('/document-library/list', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'visitor',
      },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('returns the ledger to a permitted reader with a content URL', async () => {
    decisions.read = 'allow';
    const router = await documentApiRoutes.createRouter(createFakeApp());
    const response = await router.request('/document-library/list', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'engineer',
      },
      body: '{}',
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        id: string;
        filename: string;
        contentUrl: string;
        size: number;
      }[];
    };
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toMatchObject({
      id: DOCUMENT_ID,
      filename: 'A-101-floor-plan.pdf',
      contentUrl: `/main/uploads/documents/${DOCUMENT_ID}.pdf`,
      size: FILE_BYTES.byteLength,
    });
  });

  it('filters the ledger by discipline', async () => {
    decisions.read = 'allow';
    const router = await documentApiRoutes.createRouter(createFakeApp());
    const response = await router.request('/document-library/list', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'engineer',
      },
      body: JSON.stringify({ discipline: 'hvac' }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: unknown[] };
    expect(payload.data).toHaveLength(0);
  });

  it('refuses an upload for a role without the create grant', async () => {
    decisions.create = 'deny';
    const router = await documentApiRoutes.createRouter(createFakeApp());
    const { body, contentType } = buildMultipart([
      {
        name: 'file',
        filename: 'plan.pdf',
        contentType: 'application/pdf',
        data: FILE_BYTES,
      },
      { name: 'discipline', value: 'architecture' },
    ]);
    const response = await router.request('/document-library/upload', {
      method: 'POST',
      headers: { 'content-type': contentType, 'x-test-user': 'engineer' },
      body,
    });
    expect(response.status).toBe(403);
  });

  it('rejects a file type outside the whitelist before storing it', async () => {
    decisions.create = 'allow';
    const router = await documentApiRoutes.createRouter(createFakeApp());
    const { body, contentType } = buildMultipart([
      {
        name: 'file',
        filename: 'payload.exe',
        data: Buffer.from('MZ'),
      },
      { name: 'discipline', value: 'architecture' },
    ]);
    const response = await router.request('/document-library/upload', {
      method: 'POST',
      headers: { 'content-type': contentType, 'x-test-user': 'clerk' },
      body,
    });
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { code: string };
    expect(payload.code).toBe('UNSUPPORTED_TYPE');
    const rows = await manager
      .query('main')
      .selectFrom('documents')
      .select('id')
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('rejects a batch above the file count limit', async () => {
    decisions.create = 'allow';
    const router = await documentApiRoutes.createRouter(createFakeApp());
    const parts: MultipartPart[] = [];
    for (let index = 0; index < 6; index += 1) {
      parts.push({
        name: 'file',
        filename: `plan-${index}.pdf`,
        contentType: 'application/pdf',
        data: Buffer.from('x'),
      });
    }
    parts.push({ name: 'discipline', value: 'architecture' });
    const { body, contentType } = buildMultipart(parts);
    const response = await router.request('/document-library/upload', {
      method: 'POST',
      headers: { 'content-type': contentType, 'x-test-user': 'clerk' },
      body,
    });
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { code: string };
    expect(payload.code).toBe('TOO_MANY_FILES');
  });

  it('returns statistics grouped by discipline', async () => {
    decisions.read = 'allow';
    const router = await documentApiRoutes.createRouter(createFakeApp());
    const response = await router.request('/document-library/stats', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'engineer',
      },
      body: '{}',
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        groups: { discipline: string; count: number; totalSize: number }[];
        total: { count: number; totalSize: number };
      };
    };
    expect(payload.data.groups).toEqual([
      {
        discipline: 'architecture',
        count: 1,
        totalSize: FILE_BYTES.byteLength,
      },
    ]);
    expect(payload.data.total.count).toBe(1);
  });

  it('streams the file for a permitted downloader', async () => {
    decisions.download = 'allow';
    const router = await documentContentRoutes.createRouter(createFakeApp());
    const response = await router.request(
      `/uploads/documents/${DOCUMENT_ID}.pdf`,
      { headers: { 'x-test-user': 'engineer' } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain(
      'A-101-floor-plan.pdf',
    );
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(FILE_BYTES)).toBe(true);
  });

  it('refuses the content route for a role without the download grant', async () => {
    decisions.download = 'deny';
    const router = await documentContentRoutes.createRouter(createFakeApp());
    const response = await router.request(
      `/uploads/documents/${DOCUMENT_ID}.pdf`,
      { headers: { 'x-test-user': 'visitor' } },
    );
    expect(response.status).toBe(403);
  });

  it('rejects an anonymous content request', async () => {
    decisions.download = 'allow';
    const router = await documentContentRoutes.createRouter(createFakeApp());
    const response = await router.request(
      `/uploads/documents/${DOCUMENT_ID}.pdf`,
    );
    expect(response.status).toBe(401);
  });

  it('does not find a file whose extension does not match the record', async () => {
    decisions.download = 'allow';
    const router = await documentContentRoutes.createRouter(createFakeApp());
    const response = await router.request(
      `/uploads/documents/${DOCUMENT_ID}.png`,
      { headers: { 'x-test-user': 'engineer' } },
    );
    expect(response.status).toBe(404);
  });
});
