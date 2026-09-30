// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type StandaloneServer,
  createStandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

/**
 * The internal library's business rules, against a real database.
 *
 * The application is started the same way `pnpm start` starts it, from the
 * application's own runtime, with the real authorization provider and the real
 * library provider. Only the database file is temporary and only the seeding
 * differs: migrations and seeds run at startup so the two fixture accounts and
 * the three fixture documents exist before the first request. Everything else
 * — the HTTP surface, the session, the permission sets, the restriction rule —
 * is the production path.
 */

const EDITOR = { username: 'editor.a', password: 'Library2026!' };
const READER = { username: 'reader.b', password: 'Library2026!' };
const ADMIN = { username: 'nocobase', password: 'admin123' };

/** Fixed by `database/main/seeds/202609200002_library_users.ts`. */
const READER_USER_ID = '22222222-2222-4222-8222-222222222222';

const tempDirs: string[] = [];
let server: StandaloneServer;
let baseUrl: string;
let trustedOrigin: string;
let editorCookie: string;
let readerCookie: string;
let adminCookie: string;

interface DocumentJson {
  id: number;
  title: string;
  content: string | null;
  published: boolean;
  confidential: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface ListJson {
  items: DocumentJson[];
  canRead: boolean;
  canCreate: boolean;
  canShare: boolean;
}

function writeRuntimeTestConfig(directory: string): string {
  const file = path.join(directory, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(directory, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );
  return file;
}

beforeAll(async () => {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-library-database-'),
  );
  tempDirs.push(databaseDir);
  server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      // The test does not listen on a socket, so the browser-visible origin
      // the CSRF check compares against has to be declared explicitly.
      APP_PUBLIC_ORIGIN: 'http://localhost',
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: writeRuntimeTestConfig(databaseDir),
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
  baseUrl = `http://localhost${server.application.publicBasePath}`;
  // A browser sends the origin, which has no path; the public base path is
  // part of the URL, not part of the origin.
  trustedOrigin = new URL(baseUrl).origin;
  [adminCookie, editorCookie, readerCookie] = await Promise.all([
    signIn(ADMIN.username, ADMIN.password),
    signIn(EDITOR.username, EDITOR.password),
    signIn(READER.username, READER.password),
  ]);
}, 180_000);

afterAll(async () => {
  await server?.close();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function signIn(username: string, password: string): Promise<string> {
  const response = await server.fetch(
    new Request(`${baseUrl}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function request(
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<Response> {
  return server.fetch(
    new Request(`${baseUrl}/api${path}`, {
      ...init,
      headers: {
        cookie,
        // State-changing cookie requests are checked against the trusted
        // origin, exactly as a browser would send it.
        origin: trustedOrigin,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    }),
  );
}

async function list(cookie: string): Promise<ListJson> {
  const response = await request('/library/documents', cookie);
  expect(response.status).toBe(200);
  return (await response.json()).data as ListJson;
}

function byTitle(payload: ListJson, title: string): DocumentJson {
  const document = payload.items.find((item) => item.title === title);
  if (!document) throw new Error(`No document titled ${title}`);
  return document;
}

describe('internal library authorization', () => {
  it('shows the administrator every document', async () => {
    const payload = await list(adminCookie);
    expect(payload.items.map((item) => item.title).sort()).toEqual(
      ['保密资料 C', '公开资料 P', '私有草稿 D'].sort(),
    );
    expect(payload.canShare).toBe(true);
  });

  it('shows the author their own drafts and the shared non-confidential ones', async () => {
    const payload = await list(editorCookie);
    expect(payload.items.map((item) => item.title).sort()).toEqual(
      ['保密资料 C', '公开资料 P', '私有草稿 D'].sort(),
    );
    expect(payload.canRead).toBe(true);
    expect(payload.canCreate).toBe(true);
    expect(payload.canShare).toBe(false);
    for (const item of payload.items) {
      expect(item.canEdit).toBe(true);
      expect(item.canDelete).toBe(true);
    }
  });

  it('shows the reader only published, non-confidential documents', async () => {
    const payload = await list(readerCookie);
    expect(payload.items.map((item) => item.title)).toEqual(['公开资料 P']);
    expect(payload.canRead).toBe(true);
    expect(payload.canCreate).toBe(false);
    expect(payload.canShare).toBe(false);
    expect(payload.items[0]?.canEdit).toBe(false);
    expect(payload.items[0]?.canDelete).toBe(false);
  });

  it('keeps the reader from writing, even what they may read', async () => {
    const payload = await list(readerCookie);
    const published = byTitle(payload, '公开资料 P');

    const update = await request(
      `/library/documents/${published.id}`,
      readerCookie,
      {
        method: 'PATCH',
        body: JSON.stringify({ title: '阅读者不应能改' }),
      },
    );
    expect(update.status).toBe(403);

    const create = await request('/library/documents', readerCookie, {
      method: 'POST',
      body: JSON.stringify({ title: '阅读者不应能建' }),
    });
    expect(create.status).toBe(403);

    const remove = await request(
      `/library/documents/${published.id}`,
      readerCookie,
      {
        method: 'DELETE',
      },
    );
    expect(remove.status).toBe(403);
  });

  it('keeps a draft invisible until that one record is opened', async () => {
    const editor = await list(editorCookie);
    const draft = byTitle(editor, '私有草稿 D');

    const hidden = await request(
      `/library/documents/${draft.id}`,
      readerCookie,
    );
    expect(hidden.status).toBe(404);

    const granted = await request('/library/shares', adminCookie, {
      method: 'POST',
      body: JSON.stringify({
        documentId: draft.id,
        recipientIds: [READER_USER_ID],
      }),
    });
    expect(granted.status).toBe(201);

    const opened = await request(
      `/library/documents/${draft.id}`,
      readerCookie,
    );
    expect(opened.status).toBe(200);
    const body = (await opened.json()).data as DocumentJson;
    expect(body.title).toBe('私有草稿 D');
    expect(body.canEdit).toBe(false);

    const reader = await list(readerCookie);
    expect(reader.items.map((item) => item.title).sort()).toEqual([
      '公开资料 P',
      '私有草稿 D',
    ]);

    // The share names one record, not the author's drafts as a group.
    const otherDraft = byTitle(editor, '保密资料 C');
    expect(otherDraft).toBeDefined();
    const notShared = await request(
      `/library/documents/${otherDraft.id}`,
      readerCookie,
    );
    expect(notShared.status).toBe(404);
  });

  it('never lets a confidential document reach the reader, shared or not', async () => {
    const editor = await list(editorCookie);
    const confidential = byTitle(editor, '保密资料 C');

    const shared = await request('/library/shares', adminCookie, {
      method: 'POST',
      body: JSON.stringify({
        documentId: confidential.id,
        recipientIds: [READER_USER_ID],
      }),
    });
    expect(shared.status).toBe(201);

    const reader = await list(readerCookie);
    expect(reader.items.some((item) => item.confidential)).toBe(false);
    const direct = await request(
      `/library/documents/${confidential.id}`,
      readerCookie,
    );
    expect(direct.status).toBe(404);

    // The author's own access is untouched by the reader's restrictions.
    const author = await request(
      `/library/documents/${confidential.id}`,
      editorCookie,
    );
    expect(author.status).toBe(200);
  });

  it('revokes temporary access by deleting the sharing rule', async () => {
    const shares = await request('/library/shares', adminCookie);
    expect(shares.status).toBe(200);
    const rules = (await shares.json()).data as {
      key: string;
      documentId: number;
    }[];
    expect(rules.length).toBeGreaterThan(0);

    for (const rule of rules) {
      const revoked = await request(
        `/library/shares/${rule.key}`,
        adminCookie,
        {
          method: 'DELETE',
        },
      );
      expect(revoked.status).toBe(204);
    }

    const editor = await list(editorCookie);
    const draft = byTitle(editor, '私有草稿 D');
    const reader = await list(readerCookie);
    expect(reader.items.map((item) => item.title)).toEqual(['公开资料 P']);

    const reopened = await request(
      `/library/documents/${draft.id}`,
      readerCookie,
    );
    expect(reopened.status).toBe(404);
  });

  it('lets an author create and update their own document', async () => {
    const created = await request('/library/documents', editorCookie, {
      method: 'POST',
      body: JSON.stringify({
        title: '私有草稿 D2',
        content: '作者新建的草稿。',
        published: false,
        confidential: false,
      }),
    });
    expect(created.status).toBe(201);
    const document = (await created.json()).data as DocumentJson;
    expect(document.canEdit).toBe(true);

    const updated = await request(
      `/library/documents/${document.id}`,
      editorCookie,
      {
        method: 'PATCH',
        body: JSON.stringify({ title: '私有草稿 D2 修订' }),
      },
    );
    expect(updated.status).toBe(200);
    expect(((await updated.json()).data as DocumentJson).title).toBe(
      '私有草稿 D2 修订',
    );
  });

  it('stops a disabled account from continuing with its existing session', async () => {
    const before = await request('/library/documents', readerCookie);
    expect(before.status).toBe(200);

    const disabled = await request(
      `/users/${READER_USER_ID}/disable`,
      adminCookie,
      { method: 'POST' },
    );
    expect(disabled.status).toBeLessThan(400);

    const after = await request('/library/documents', readerCookie);
    expect([401, 403]).toContain(after.status);
  });
});
