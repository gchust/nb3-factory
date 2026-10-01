// @vitest-environment node
/**
 * Business behaviour of the document library, exercised through the real HTTP
 * surface of an installed application: migrations and seeds have run, the two
 * permission sets are in the database, and every assertion signs in as one of
 * the demonstration accounts.
 *
 * The cases track the requirement directly: a published, non-confidential
 * document is open to every reader; a draft is owner-only until an
 * administrator opens that one document, and closing it again hides it; a
 * confidential document stays hidden even when it is shared; reading never
 * grants editing; and disabling the reader's account ends an already-open
 * session.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  MAINTAINER_USERNAME,
  READER_USERNAME,
} from '../../database/seed-data/accounts.js';
import {
  CONFIDENTIAL_DOCUMENT_ID,
  DRAFT_DOCUMENT_ID,
  PUBLIC_DOCUMENT_ID,
} from '../../database/seed-data/documents.js';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.js';

const ADMIN = { username: 'nocobase', password: 'admin123' };
const MAINTAINER = { username: MAINTAINER_USERNAME, password: 'Library#2026' };
const READER = { username: READER_USERNAME, password: 'Library#2026' };

interface TestContext {
  readonly server: StandaloneServer;
  readonly baseUrl: string;
  readonly directory: string;
}

let context: TestContext;

function writeRuntimeConfig(directory: string): string {
  const file = path.join(directory, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      auth: { secret: 'library-test-secret-at-least-32-characters' },
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

async function signIn(credentials: {
  username: string;
  password: string;
}): Promise<string> {
  const response = await context.server.fetch(
    new Request(`${context.baseUrl}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function api(
  pathname: string,
  cookie?: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) {
    headers.set('cookie', cookie);
    // The authentication middleware rejects a cookie-authenticated write
    // without a same-origin `Origin`, so a browser's own request would carry
    // one and this helper has to as well.
    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      headers.set('origin', new URL(context.baseUrl).origin);
    }
  }
  return context.server.fetch(
    new Request(`${context.baseUrl}${pathname}`, { ...init, headers }),
  );
}

async function listIds(cookie: string): Promise<string[]> {
  const response = await api('/api/library/documents', cookie);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { id: string }[] };
  return body.data.map((record) => record.id).sort();
}

beforeAll(async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'library-test-database-'));
  const rootDir = path.resolve(import.meta.dirname, '../..');
  const server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      // The authentication middleware checks the `Origin` of a cookie write
      // against the app's public origin, so the test declares the origin it
      // calls the server on instead of relying on the request host.
      APP_PUBLIC_ORIGIN: 'http://localhost',
      APP_CONFIG_FILE: writeRuntimeConfig(directory),
    },
    paths: {
      rootDir,
      serverDir: path.join(rootDir, 'server'),
      databaseDir: path.join(rootDir, 'database'),
      clientDir: path.join(rootDir, 'dist/client'),
      storageDir: path.join(rootDir, 'storage'),
    },
  });
  context = {
    server,
    baseUrl: `http://localhost${server.application.publicBasePath}`,
    directory,
  };
}, 300_000);

afterAll(async () => {
  await context.server.close();
  rmSync(context.directory, { recursive: true, force: true });
});

describe('library access', () => {
  it('rejects anonymous requests', async () => {
    const response = await api('/api/library/documents');
    expect(response.status).toBe(401);
  });

  it('shows the maintainer every document they own', async () => {
    const cookie = await signIn(MAINTAINER);
    expect(await listIds(cookie)).toEqual(
      [PUBLIC_DOCUMENT_ID, DRAFT_DOCUMENT_ID, CONFIDENTIAL_DOCUMENT_ID].sort(),
    );
  });

  it('shows the administrator every document, confidential included', async () => {
    const cookie = await signIn(ADMIN);
    expect(await listIds(cookie)).toEqual(
      [PUBLIC_DOCUMENT_ID, DRAFT_DOCUMENT_ID, CONFIDENTIAL_DOCUMENT_ID].sort(),
    );
  });

  it('opens published, non-confidential documents to the reader only', async () => {
    const cookie = await signIn(READER);
    expect(await listIds(cookie)).toEqual([PUBLIC_DOCUMENT_ID]);
  });

  it('hides the draft from the reader, directly as well as in the list', async () => {
    const cookie = await signIn(READER);
    const response = await api(
      `/api/library/documents/${DRAFT_DOCUMENT_ID}`,
      cookie,
    );
    expect(response.status).toBe(404);
  });

  it('keeps a shared confidential document hidden from the reader', async () => {
    const cookie = await signIn(READER);
    // The seed already shared this document with the reader on purpose.
    const response = await api(
      `/api/library/documents/${CONFIDENTIAL_DOCUMENT_ID}`,
      cookie,
    );
    expect(response.status).toBe(404);
  });

  it('does not let reading a document become editing it', async () => {
    const cookie = await signIn(READER);
    const response = await api(
      `/api/library/documents/${PUBLIC_DOCUMENT_ID}`,
      cookie,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'reader changed this' }),
      },
    );
    expect(response.status).toBe(403);
  });

  it('lets the maintainer edit their own document', async () => {
    const cookie = await signIn(MAINTAINER);
    const response = await api(
      `/api/library/documents/${DRAFT_DOCUMENT_ID}`,
      cookie,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '私有草稿 D（已更新）' }),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { ownerId: string; title: string };
    };
    expect(body.data.title).toBe('私有草稿 D（已更新）');
    expect(body.data.ownerId).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('opens one draft on request and hides it again after revocation', async () => {
    const adminCookie = await signIn(ADMIN);
    const readerCookie = await signIn(READER);

    const accountsResponse = await api('/api/library/accounts', adminCookie);
    expect(accountsResponse.status).toBe(200);
    const accounts = (await accountsResponse.json()) as {
      data: { id: string; username: string | null }[];
    };
    const reader = accounts.data.find(
      (account) => account.username === READER_USERNAME,
    );
    expect(reader).toBeDefined();

    const created = await api(
      `/api/library/documents/${DRAFT_DOCUMENT_ID}/shares`,
      adminCookie,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: reader!.id }),
      },
    );
    expect(created.status).toBe(201);
    const share = (await created.json()) as { data: { id: string } };

    expect(await listIds(readerCookie)).toContain(DRAFT_DOCUMENT_ID);
    expect(
      (await api(`/api/library/documents/${DRAFT_DOCUMENT_ID}`, readerCookie))
        .status,
    ).toBe(200);

    const revoked = await api(
      `/api/library/documents/${DRAFT_DOCUMENT_ID}/shares/${share.data.id}`,
      adminCookie,
      { method: 'DELETE' },
    );
    expect(revoked.status).toBe(200);

    expect(await listIds(readerCookie)).not.toContain(DRAFT_DOCUMENT_ID);
    expect(
      (await api(`/api/library/documents/${DRAFT_DOCUMENT_ID}`, readerCookie))
        .status,
    ).toBe(404);
  });

  it('lets only the administrator manage shares', async () => {
    const cookie = await signIn(READER);
    const response = await api(
      `/api/library/documents/${PUBLIC_DOCUMENT_ID}/shares`,
      cookie,
    );
    expect(response.status).toBe(403);
  });

  it('ends an open session when the administrator disables the account', async () => {
    const adminCookie = await signIn(ADMIN);
    const readerCookie = await signIn(READER);
    expect((await api('/api/library/documents', readerCookie)).status).toBe(
      200,
    );

    const accountsResponse = await api('/api/library/accounts', adminCookie);
    const accounts = (await accountsResponse.json()) as {
      data: { id: string; username: string | null }[];
    };
    const reader = accounts.data.find(
      (account) => account.username === READER_USERNAME,
    );
    expect(reader).toBeDefined();

    const disabled = await api(
      `/api/users/${reader!.id}/disable`,
      adminCookie,
      { method: 'POST' },
    );
    expect(disabled.status).toBe(200);

    expect((await api('/api/library/documents', readerCookie)).status).toBe(
      401,
    );
  });
});
