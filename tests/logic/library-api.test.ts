// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createTestAppConfig,
  type TestAppConfig,
} from '@nocobase/app-testing/server';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.js';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const servers: StandaloneServer[] = [];
const configs: TestAppConfig[] = [];
const tempDirs: string[] = [];

interface Session {
  readonly cookie: string;
  readonly userId: string;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(configs.splice(0).map((config) => config.dispose()));
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function startApp(sampleData = false): Promise<StandaloneServer> {
  const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-library-api-'));
  tempDirs.push(directory);
  const config = await createTestAppConfig({
    connections: ['main'],
    install: true,
    config: {
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      jobs: {
        default: 'memory',
        memory: {
          adapter: 'memory',
          persistence: { path: path.join(directory, 'jobs') },
        },
      },
      queue: {
        default: 'memory',
        memory: {
          adapter: 'inMemory',
          persistence: { path: path.join(directory, 'queue') },
        },
      },
      database: { connections: { main: { seeds: { autoRun: true } } } },
    },
  });
  configs.push(config);
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_SAMPLE_DATA: sampleData ? 'true' : 'false',
      APP_CONFIG_FILE: config.path,
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
  servers.push(server);
  return server;
}

function request(
  server: StandaloneServer,
  route: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('origin')) headers.set('origin', 'http://localhost');
  if (!headers.has('referer')) {
    headers.set(
      'referer',
      `http://localhost${server.application.publicBasePath}/`,
    );
  }
  return Promise.resolve(
    server.fetch(
      new Request(
        `http://localhost${server.application.publicBasePath}${route}`,
        { ...init, headers },
      ),
    ),
  );
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function signIn(
  server: StandaloneServer,
  username: string,
  password: string,
): Promise<Session> {
  const email = username.includes('@');
  const response = await request(
    server,
    email ? '/api/auth/sign-in/email' : '/api/auth/sign-in/username',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        email ? { email: username, password } : { username, password },
      ),
    },
  );
  expect(response.status).toBe(200);
  const body = await json<{
    data?: { user?: { id?: string } };
    user?: { id?: string };
  }>(response);
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  return {
    cookie,
    userId: String(body.data?.user?.id ?? body.user?.id ?? ''),
  };
}

async function createPerson(
  server: StandaloneServer,
  admin: Session,
  username: string,
): Promise<string> {
  const response = await request(server, '/api/users', {
    method: 'POST',
    headers: { cookie: admin.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: username,
      username,
      email: `${username}@example.com`,
      password: 'library-test-password',
    }),
  });
  expect(response.status).toBe(201);
  return String((await json<{ data: { id: string } }>(response)).data.id);
}

async function assign(
  server: StandaloneServer,
  admin: Session,
  set: string,
  userId: string,
): Promise<void> {
  const response = await request(
    server,
    `/api/authorization/permissionSets/${set}/assignments`,
    {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ subject: { type: 'user', id: userId } }),
    },
  );
  expect(response.status).toBe(201);
}

async function createDocument(
  server: StandaloneServer,
  session: Session,
  document: {
    title: string;
    body?: string;
    published: boolean;
    confidential?: boolean;
  },
): Promise<{ id: string }> {
  const response = await request(server, '/api/library/documents', {
    method: 'POST',
    headers: { cookie: session.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ body: '', confidential: false, ...document }),
  });
  expect(response.status).toBe(201);
  return (await json<{ data: { id: string } }>(response)).data;
}

describe('document library API', () => {
  it('serves readers only published, shared and non-confidential documents', async () => {
    const server = await startApp();
    const admin = await signIn(server, 'nocobase', 'admin123');
    const maintainerId = await createPerson(server, admin, 'maintainer');
    const readerId = await createPerson(server, admin, 'reader');
    await assign(server, admin, 'library-maintainer', maintainerId);
    await assign(server, admin, 'library-reader', readerId);
    const maintainer = await signIn(
      server,
      'maintainer',
      'library-test-password',
    );
    const reader = await signIn(server, 'reader', 'library-test-password');

    const draft = await createDocument(server, maintainer, {
      title: 'Private draft',
      published: false,
    });
    const published = await createDocument(server, maintainer, {
      title: 'Published note',
      published: true,
    });
    const confidential = await createDocument(server, maintainer, {
      title: 'Confidential draft',
      published: true,
      confidential: true,
    });

    const anonymous = await request(server, '/api/library/documents');
    expect(anonymous.status).toBe(401);

    const readerList = await request(server, '/api/library/documents', {
      headers: { cookie: reader.cookie },
    });
    expect(readerList.status).toBe(200);
    const listed = await json<{
      data: { id: string }[];
      meta: { total: number };
    }>(readerList);
    expect(listed.data.map((document) => document.id)).toEqual([published.id]);
    expect(listed.meta.total).toBe(1);
    expect(
      (
        await request(server, `/api/library/documents/${draft.id}`, {
          headers: { cookie: reader.cookie },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(server, `/api/library/documents/${confidential.id}`, {
          headers: { cookie: reader.cookie },
        })
      ).status,
    ).toBe(404);

    const createAsReader = await request(server, '/api/library/documents', {
      method: 'POST',
      headers: { cookie: reader.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Not allowed', published: false }),
    });
    expect(createAsReader.status).toBe(403);
    expect(
      (
        await request(server, '/api/library/admin/documents', {
          headers: { cookie: reader.cookie },
        })
      ).status,
    ).toBe(403);

    const share = await request(server, '/api/library/shares', {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ documentId: draft.id, userId: readerId }),
    });
    expect(share.status).toBe(201);
    const shareId = String(
      (await json<{ data: { id: string } }>(share)).data.id,
    );
    expect(
      (
        await request(server, `/api/library/documents/${draft.id}`, {
          headers: { cookie: reader.cookie },
        })
      ).status,
    ).toBe(200);

    // A share never widens visibility to a document marked confidential later.
    for (const confidentialValue of [true, false]) {
      const changed = await request(
        server,
        `/api/library/documents/${draft.id}`,
        {
          method: 'PATCH',
          headers: {
            cookie: maintainer.cookie,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ confidential: confidentialValue }),
        },
      );
      expect(changed.status).toBe(200);
      expect(
        (
          await request(server, `/api/library/documents/${draft.id}`, {
            headers: { cookie: reader.cookie },
          })
        ).status,
      ).toBe(confidentialValue ? 404 : 200);
    }

    const adminDocuments = await request(
      server,
      '/api/library/admin/documents?page=1&pageSize=100',
      { headers: { cookie: admin.cookie } },
    );
    expect(adminDocuments.status).toBe(200);
    const administered = await json<{
      data: { id: string; shares: { userId: string }[] }[];
      meta: { total: number };
    }>(adminDocuments);
    expect(administered.meta.total).toBe(3);
    expect(
      administered.data.find((document) => document.id === draft.id)?.shares,
    ).toEqual([expect.objectContaining({ userId: readerId })]);
    expect(
      administered.data.some((document) => document.id === confidential.id),
    ).toBe(true);

    const adminUsers = await request(server, '/api/library/admin/users', {
      headers: { cookie: admin.cookie },
    });
    expect(adminUsers.status).toBe(200);
    const selectable = await json<{
      data: { id: string; name: string; email: string }[];
    }>(adminUsers);
    expect(selectable.data.find((person) => person.id === readerId)).toEqual({
      id: readerId,
      name: 'reader',
      email: 'reader@example.com',
    });

    const refused = await request(server, '/api/library/shares', {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ documentId: confidential.id, userId: readerId }),
    });
    expect(refused.status).toBe(400);

    const revoked = await request(server, `/api/library/shares/${shareId}`, {
      method: 'DELETE',
      headers: { cookie: admin.cookie },
    });
    expect(revoked.status).toBe(204);
    expect(
      (
        await request(server, `/api/library/documents/${draft.id}`, {
          headers: { cookie: reader.cookie },
        })
      ).status,
    ).toBe(404);
  }, 120_000);

  it('keeps editing and deleting inside the maintainer who owns the document', async () => {
    const server = await startApp();
    const admin = await signIn(server, 'nocobase', 'admin123');
    const ownerId = await createPerson(server, admin, 'owner');
    const otherId = await createPerson(server, admin, 'other');
    await assign(server, admin, 'library-maintainer', ownerId);
    await assign(server, admin, 'library-maintainer', otherId);
    const owner = await signIn(server, 'owner', 'library-test-password');
    const other = await signIn(server, 'other', 'library-test-password');
    const document = await createDocument(server, owner, {
      title: 'Owner draft',
      published: false,
    });
    const published = await createDocument(server, owner, {
      title: 'Owner published note',
      published: true,
    });

    // A colleague may read a published document but not change it.
    const visible = await request(
      server,
      `/api/library/documents/${published.id}`,
      { headers: { cookie: other.cookie } },
    );
    expect(visible.status).toBe(200);
    expect(
      (await json<{ data: { canEdit: boolean; canDelete: boolean } }>(visible))
        .data,
    ).toMatchObject({ canEdit: false, canDelete: false });
    const owned = await request(
      server,
      `/api/library/documents/${published.id}`,
      { headers: { cookie: owner.cookie } },
    );
    expect(
      (await json<{ data: { canEdit: boolean; canDelete: boolean } }>(owned))
        .data,
    ).toMatchObject({ canEdit: true, canDelete: true });
    expect(
      (
        await request(server, `/api/library/documents/${published.id}`, {
          method: 'PATCH',
          headers: {
            cookie: other.cookie,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ title: 'Stolen published note' }),
        })
      ).status,
    ).toBe(404);

    expect(
      (
        await request(server, `/api/library/documents/${document.id}`, {
          method: 'PATCH',
          headers: {
            cookie: other.cookie,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ title: 'Stolen' }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(server, `/api/library/documents/${document.id}`, {
          method: 'DELETE',
          headers: { cookie: other.cookie },
        })
      ).status,
    ).toBe(404);
    const changed = await request(
      server,
      `/api/library/documents/${document.id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: owner.cookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ title: 'Updated draft', published: true }),
      },
    );
    expect(changed.status).toBe(200);
    const updated = await json<{ data: { title: string; published: boolean } }>(
      changed,
    );
    expect(updated.data).toMatchObject({
      title: 'Updated draft',
      published: true,
    });

    const removed = await request(
      server,
      `/api/library/documents/${document.id}`,
      { method: 'DELETE', headers: { cookie: owner.cookie } },
    );
    expect(removed.status).toBe(204);
  }, 120_000);

  it('delivers the three sample documents and the two business accounts', async () => {
    const server = await startApp(true);
    const admin = await signIn(server, 'nocobase', 'admin123');
    const maintainer = await signIn(server, 'jia', 'library123');
    const reader = await signIn(server, 'yi@example.com', 'library123');

    const list = async (session: Session) => {
      const response = await request(server, '/api/library/documents', {
        headers: { cookie: session.cookie },
      });
      expect(response.status).toBe(200);
      return (await json<{ data: { id: string; title: string }[] }>(response))
        .data;
    };

    const maintainerDocuments = await list(maintainer);
    expect(
      maintainerDocuments.map((document) => document.title).sort(),
    ).toEqual(['公开资料 P', '私有草稿 D', '保密资料 C'].sort());
    const readerDocuments = await list(reader);
    expect(readerDocuments.map((document) => document.title)).toEqual([
      '公开资料 P',
    ]);

    const draft = maintainerDocuments.find(
      (document) => document.title === '私有草稿 D',
    )!;
    const confidential = maintainerDocuments.find(
      (document) => document.title === '保密资料 C',
    )!;
    expect(
      (
        await request(server, `/api/library/documents/${draft.id}`, {
          headers: { cookie: reader.cookie },
        })
      ).status,
    ).toBe(404);

    const share = await request(server, '/api/library/shares', {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ documentId: draft.id, userId: reader.userId }),
    });
    expect(share.status).toBe(201);
    expect(
      (
        await request(server, `/api/library/documents/${draft.id}`, {
          headers: { cookie: reader.cookie },
        })
      ).status,
    ).toBe(200);

    const refused = await request(server, '/api/library/shares', {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        documentId: confidential.id,
        userId: reader.userId,
      }),
    });
    expect(refused.status).toBe(400);

    const shareId = String(
      (await json<{ data: { id: string } }>(share)).data.id,
    );
    const revoked = await request(server, `/api/library/shares/${shareId}`, {
      method: 'DELETE',
      headers: { cookie: admin.cookie },
    });
    expect(revoked.status).toBe(204);
    expect(
      (
        await request(server, `/api/library/documents/${draft.id}`, {
          headers: { cookie: reader.cookie },
        })
      ).status,
    ).toBe(404);
  }, 120_000);
});
