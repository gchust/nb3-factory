// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

/**
 * Business tests for the one-page library's permission model. They run against
 * a real standalone server backed by a temporary SQLite database, so the
 * migrations and seeds under test are the ones a deployment runs, and every
 * assertion is made through the same HTTP endpoints a browser would call.
 */

const APPLICATION_ROOT = path.resolve(import.meta.dirname, '../..');

const LIBRARY_RESOURCE = { type: 'resource', id: 'library.materials' };
const READER_SUBJECT = { type: 'user', id: 'library-reader-b' };

const EDITOR_ID = 'library-editor-a';
const READER_ID = 'library-reader-b';
const PUBLIC_ID = 'library-public-p';
const DRAFT_ID = 'library-draft-d';
const CONFIDENTIAL_ID = 'library-confidential-c';

const DRAFT_SHARING_RULE = {
  key: 'library-share-draft-d',
  title: 'Share private draft D',
  resource: LIBRARY_RESOURCE,
  subjects: [READER_SUBJECT],
  actions: [
    {
      action: 'view',
      scopeKey: 'materials',
      selection: { type: 'records', ids: [DRAFT_ID] },
    },
  ],
};

const CONFIDENTIAL_RESTRICTION_RULE = {
  key: 'library-hide-confidential',
  title: 'Hide confidential materials',
  resource: LIBRARY_RESOURCE,
  subjects: [READER_SUBJECT],
  actions: [
    {
      action: 'view',
      scopeKey: 'materials',
      scope: { type: 'database', recordAccess: 'library.nonConfidential' },
    },
  ],
  reason: 'Confidential materials are never shown to readers.',
};

let server: StandaloneServer;
let baseUrl: string;
let tempDir: string;
let adminCookie: string;
let editorCookie: string;
let readerCookie: string;

beforeAll(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'library-permissions-'));
  writeFileSync(
    path.join(tempDir, 'config.json'),
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(tempDir, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );

  server = await createStandaloneServer({
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: path.join(tempDir, 'config.json'),
      // A public origin gives Better Auth a base URL, which is what the CSRF
      // origin check trusts for the cookie-authenticated writes below.
      APP_PUBLIC_ORIGIN: 'http://localhost',
    },
    paths: {
      rootDir: APPLICATION_ROOT,
      serverDir: path.join(APPLICATION_ROOT, 'server'),
      databaseDir: path.join(APPLICATION_ROOT, 'database'),
      clientDir: path.join(APPLICATION_ROOT, 'dist/client'),
      storageDir: tempDir,
    },
    viteDevUrl: false,
  });
  baseUrl = `http://localhost${server.application.publicBasePath}`;

  adminCookie = await signIn('nocobase', 'admin123');
  editorCookie = await signIn('librarian.a', 'library123');
  readerCookie = await signIn('reader.b', 'library123');
});

afterAll(async () => {
  await server?.close();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
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

function request(pathname: string, init: RequestInit = {}) {
  return server.fetch(new Request(`${baseUrl}${pathname}`, init));
}

function withCookie(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie,
      // State-changing requests pass the host's CSRF origin check, exactly as
      // the browser client does.
      origin: 'http://localhost',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  };
}

interface ListedMaterial {
  readonly id: string;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
}

async function listMaterials(cookie: string): Promise<{
  status: number;
  ids: string[];
  canCreate: boolean;
  rows: ListedMaterial[];
}> {
  const response = await request('/api/library/materials', withCookie(cookie));
  if (response.status !== 200) {
    return { status: response.status, ids: [], canCreate: false, rows: [] };
  }
  const body = (await response.json()) as {
    data: ListedMaterial[];
    meta?: { canCreate?: boolean };
  };
  return {
    status: response.status,
    ids: body.data.map((row) => row.id).sort(),
    canCreate: body.meta?.canCreate === true,
    rows: body.data,
  };
}

async function listRuleKeys(kind: 'sharing' | 'restriction') {
  const response = await request(
    `/api/authz/${kind}-rules`,
    withCookie(adminCookie),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { key: string }[] };
  return body.data.map((rule) => rule.key);
}

async function deleteRule(kind: 'sharing' | 'restriction', key: string) {
  const response = await request(
    `/api/authz/${kind}-rules/${encodeURIComponent(key)}`,
    withCookie(adminCookie, { method: 'DELETE' }),
  );
  expect(response.status).toBe(204);
}

async function createRule(
  kind: 'sharing' | 'restriction',
  rule: Record<string, unknown>,
) {
  const response = await request(
    `/api/authz/${kind}-rules`,
    withCookie(adminCookie, {
      method: 'POST',
      body: JSON.stringify(rule),
    }),
  );
  expect(response.status).toBe(201);
}

describe('library material permissions', () => {
  it('rejects an anonymous read', async () => {
    const response = await request('/api/library/materials');
    expect(response.status).toBe(401);
  });

  it('shows the editor every material it owns and its write capability', async () => {
    const { status, ids, canCreate, rows } = await listMaterials(editorCookie);
    expect(status).toBe(200);
    expect(ids).toEqual([CONFIDENTIAL_ID, DRAFT_ID, PUBLIC_ID]);
    // The scoped edit/delete grants never reach the client permission snapshot,
    // so the list response states them: create at the collection level, and
    // edit/delete per row against each action's own Policy.
    expect(canCreate).toBe(true);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.canEdit && row.canDelete)).toBe(true);
  });

  it('lets the administrator read every material', async () => {
    const { status, ids } = await listMaterials(adminCookie);
    expect(status).toBe(200);
    expect(ids).toEqual([CONFIDENTIAL_ID, DRAFT_ID, PUBLIC_ID]);
  });

  it('shows the reader only the public material by default', async () => {
    const { status, ids, canCreate, rows } = await listMaterials(readerCookie);
    expect(status).toBe(200);
    expect(ids).toEqual([PUBLIC_ID]);
    // The delivered default ships no sharing rule for draft D, so the reader
    // cannot see it until an administrator shares it at runtime. The
    // confidential C sharing rule is seeded on purpose — it never exposes C,
    // and B04 uses it to show the restriction outranks another sharing source.
    expect(ids).not.toContain(DRAFT_ID);
    expect(ids).not.toContain(CONFIDENTIAL_ID);
    const sharingKeys = await listRuleKeys('sharing');
    expect(sharingKeys).not.toContain(DRAFT_SHARING_RULE.key);
    expect(sharingKeys).toContain('library-share-confidential-c');
    // The reader has no write capability, and every listed row agrees.
    expect(canCreate).toBe(false);
    expect(rows.every((row) => !row.canEdit && !row.canDelete)).toBe(true);
  });

  it('denies the reader every write action', async () => {
    const create = await request(
      '/api/library/materials',
      withCookie(readerCookie, {
        method: 'POST',
        body: JSON.stringify({ title: 'Reader attempt' }),
      }),
    );
    expect(create.status).toBe(403);

    const update = await request(
      `/api/library/materials/${PUBLIC_ID}`,
      withCookie(readerCookie, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Reader attempt' }),
      }),
    );
    expect(update.status).toBe(403);

    const remove = await request(
      `/api/library/materials/${PUBLIC_ID}`,
      withCookie(readerCookie, { method: 'DELETE' }),
    );
    expect(remove.status).toBe(403);
  });

  it('lets the editor maintain only its own materials', async () => {
    const created = await request(
      '/api/library/materials',
      withCookie(editorCookie, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Editor draft',
          body: 'Created by the editor.',
          published: false,
          confidential: false,
        }),
      }),
    );
    expect(created.status).toBe(201);
    const record = (await created.json()) as {
      data: { id: string; ownerId: string };
    };
    expect(record.data.ownerId).toBe(EDITOR_ID);

    const updated = await request(
      `/api/library/materials/${record.data.id}`,
      withCookie(editorCookie, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Editor draft updated' }),
      }),
    );
    expect(updated.status).toBe(200);

    const removed = await request(
      `/api/library/materials/${record.data.id}`,
      withCookie(editorCookie, { method: 'DELETE' }),
    );
    expect(removed.status).toBe(200);
  });

  it('grants the shared draft to the reader and revokes it', async () => {
    await createRule('sharing', DRAFT_SHARING_RULE);
    let ids = (await listMaterials(readerCookie)).ids;
    expect(ids).toEqual([DRAFT_ID, PUBLIC_ID]);

    await deleteRule('sharing', DRAFT_SHARING_RULE.key);
    ids = (await listMaterials(readerCookie)).ids;
    expect(ids).toEqual([PUBLIC_ID]);
  });

  it('withholds confidential material even when a sharing source exposes it', async () => {
    // The delivered default already shares C with the reader. With the
    // Restriction Rule present that sharing source cannot expose C.
    let ids = (await listMaterials(readerCookie)).ids;
    expect(ids).not.toContain(CONFIDENTIAL_ID);

    // Without the Restriction Rule the same seeded sharing source does expose
    // C, proving the restriction is what hides it.
    await deleteRule('restriction', CONFIDENTIAL_RESTRICTION_RULE.key);
    ids = (await listMaterials(readerCookie)).ids;
    expect(ids).toContain(CONFIDENTIAL_ID);

    await createRule('restriction', CONFIDENTIAL_RESTRICTION_RULE);
    ids = (await listMaterials(readerCookie)).ids;
    expect(ids).not.toContain(CONFIDENTIAL_ID);
  });

  it('leaves the editor access untouched by the reader restriction', async () => {
    const { ids } = await listMaterials(editorCookie);
    expect(ids).toEqual([CONFIDENTIAL_ID, DRAFT_ID, PUBLIC_ID]);
  });

  it('invalidates the reader session when the account is disabled', async () => {
    const disabled = await request(
      `/api/users/${READER_ID}/disable`,
      withCookie(adminCookie, { method: 'POST' }),
    );
    expect(disabled.status).toBe(200);

    const response = await request(
      '/api/library/materials',
      withCookie(readerCookie),
    );
    expect(response.status).toBe(401);
  });
});
