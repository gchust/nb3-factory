// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { databaseManagerToken, type MigrationContext } from '@nocobase/db';
import type { Knex } from 'knex';
import { afterEach, expect, it } from 'vitest';

import documentAttachmentsMigration from '../../database/main/migrations/202609240001_create_document_attachments.ts';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

// A real one-pixel PNG so the content route returns bytes a browser can decode.
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const servers: StandaloneServer[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** `app-server.test.ts` keeps its harness private, so this file starts the same runtime with its own copy. */
async function startInstalledServer(): Promise<StandaloneServer> {
  const workspaceRoot = path.resolve(import.meta.dirname, '../..');
  const dataDir = mkdtempSync(path.join(tmpdir(), 'nocobase-documents-'));
  tempDirs.push(dataDir);
  const configFile = path.join(dataDir, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      app: { publicOrigin: 'http://localhost' },
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(dataDir, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );

  const server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: configFile,
    },
    paths: {
      rootDir: workspaceRoot,
      serverDir: path.join(workspaceRoot, 'server'),
      databaseDir: path.join(workspaceRoot, 'database'),
      clientDir: path.join(workspaceRoot, 'dist/client'),
      // The upload disk defaults to `paths.storage()`, so this keeps stored
      // files inside the throwaway directory instead of the workspace.
      storageDir: dataDir,
    },
  });
  servers.push(server);
  return server;
}

function request(
  server: StandaloneServer,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return server.fetch(new Request(input, init));
}

interface DocumentResponse {
  readonly id: string;
  readonly title: string;
  readonly attachmentId: string | null;
  readonly attachment: {
    readonly id: string;
    readonly filename: string;
    readonly mimeType: string;
    readonly ext: string;
    readonly contentUrl?: string;
  } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

it('stores, reads and removes one attachment per document', async () => {
  const server = await startInstalledServer();
  const baseUrl = `http://localhost${server.application.publicBasePath}`;

  // The endpoints are not public: an anonymous caller cannot read or change a document.
  expect((await request(server, `${baseUrl}/api/documents`)).status).toBe(401);
  expect(
    (
      await request(server, `${baseUrl}/api/documents/${randomUUID()}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'blocked' }),
      })
    ).status,
  ).toBe(401);

  const signIn = await request(server, `${baseUrl}/api/auth/sign-in/username`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  expect(signIn.status).toBe(200);
  const cookie = signIn.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  // A cookie-authenticated write is refused without a trusted Origin, so the
  // requests below carry the same-origin header a browser would send.
  const authed = { cookie, origin: new URL(baseUrl).origin };

  // The seed ships exactly two documents and each starts without a file.
  const seeded = await request(server, `${baseUrl}/api/documents`, {
    headers: authed,
  });
  expect(seeded.status).toBe(200);
  const seededBody = (await seeded.json()) as {
    data: readonly DocumentResponse[];
  };
  expect(seededBody.data).toHaveLength(2);
  expect(seededBody.data.every((item) => item.attachment === null)).toBe(true);

  // Creating a document trims the title and leaves it unattached.
  const created = await request(server, `${baseUrl}/api/documents`, {
    method: 'POST',
    headers: { ...authed, 'content-type': 'application/json' },
    body: JSON.stringify({ title: '  验收资料  ' }),
  });
  expect(created.status).toBe(201);
  const createdBody = (await created.json()) as { data: DocumentResponse };
  expect(createdBody.data.title).toBe('验收资料');
  expect(createdBody.data.attachmentId).toBeNull();
  expect(createdBody.data.attachment).toBeNull();

  // An empty title is rejected instead of being stored.
  const emptyTitle = await request(server, `${baseUrl}/api/documents`, {
    method: 'POST',
    headers: { ...authed, 'content-type': 'application/json' },
    body: JSON.stringify({ title: '   ' }),
  });
  expect(emptyTitle.status).toBe(400);

  // Anonymous uploads are rejected too; the file write route is not public.
  const anonymousUpload = new FormData();
  anonymousUpload.append(
    'file',
    new File([VALID_PNG], 'sample.png', { type: 'image/png' }),
  );
  expect(
    (
      await request(server, `${baseUrl}/api/documentAttachments:uploadOne`, {
        method: 'POST',
        body: anonymousUpload,
      })
    ).status,
  ).toBe(401);

  const form = new FormData();
  form.append(
    'file',
    new File([VALID_PNG], 'sample.png', { type: 'image/png' }),
  );
  const upload = await request(
    server,
    `${baseUrl}/api/documentAttachments:uploadOne`,
    { method: 'POST', headers: authed, body: form },
  );
  expect(upload.status).toBe(200);
  const uploadBody = (await upload.json()) as {
    data: { record: DocumentResponse['attachment'] & { id: string } };
  };
  const record = uploadBody.data.record;
  expect(record.filename).toBe('sample.png');
  expect(record.mimeType).toBe('image/png');
  expect(record.ext).toBe('png');
  expect(record.contentUrl).toBeTruthy();

  // Saving the association is what makes it survive a refresh.
  const attached = await request(
    server,
    `${baseUrl}/api/documents/${createdBody.data.id}`,
    {
      method: 'PATCH',
      headers: { ...authed, 'content-type': 'application/json' },
      body: JSON.stringify({ attachmentId: record.id }),
    },
  );
  expect(attached.status).toBe(200);
  const attachedBody = (await attached.json()) as { data: DocumentResponse };
  expect(attachedBody.data.attachmentId).toBe(record.id);

  // A fresh read returns the file metadata and its preview URL, not just the id.
  const reloaded = await request(server, `${baseUrl}/api/documents`, {
    headers: authed,
  });
  const reloadedBody = (await reloaded.json()) as {
    data: readonly DocumentResponse[];
  };
  const reloadedDocument = reloadedBody.data.find(
    (item) => item.id === createdBody.data.id,
  );
  expect(reloadedDocument?.attachment?.filename).toBe('sample.png');
  const contentUrl = reloadedDocument?.attachment?.contentUrl;
  expect(contentUrl).toBeTruthy();

  // The content route serves the stored bytes back for the preview.
  const content = await request(server, `http://localhost${contentUrl}`);
  expect(content.status).toBe(200);
  expect(Buffer.from(await content.arrayBuffer()).equals(VALID_PNG)).toBe(true);

  // A document that does not exist is reported rather than silently ignored.
  const missing = await request(
    server,
    `${baseUrl}/api/documents/${randomUUID()}`,
    {
      method: 'PATCH',
      headers: { ...authed, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'nowhere' }),
    },
  );
  expect(missing.status).toBe(404);

  // Attaching a file that was never uploaded is refused.
  const invalidAttachment = await request(
    server,
    `${baseUrl}/api/documents/${createdBody.data.id}`,
    {
      method: 'PATCH',
      headers: { ...authed, 'content-type': 'application/json' },
      body: JSON.stringify({ attachmentId: randomUUID() }),
    },
  );
  expect(invalidAttachment.status).toBe(400);

  // Removing the attachment leaves the document in place with no file.
  const detached = await request(
    server,
    `${baseUrl}/api/documents/${createdBody.data.id}`,
    {
      method: 'PATCH',
      headers: { ...authed, 'content-type': 'application/json' },
      body: JSON.stringify({ attachmentId: null }),
    },
  );
  expect(detached.status).toBe(200);
  expect(
    ((await detached.json()) as { data: DocumentResponse }).data.attachmentId,
  ).toBeNull();

  // The migration's own `down` reverses the schema and `up` restores it: run
  // both against this real database instead of only trusting the tables exist.
  const database = server.application.container.resolve(databaseManagerToken);
  const builder = database.builder();
  const client = await database.connection('main').client<Knex>();
  const tableNames = async (): Promise<readonly string[]> =>
    client('sqlite_master').where({ type: 'table' }).pluck('name');

  await documentAttachmentsMigration.down?.({ builder } as MigrationContext);
  expect(await tableNames()).not.toContain('documents');
  expect(await tableNames()).not.toContain('document_files');

  await documentAttachmentsMigration.up({ builder } as MigrationContext);
  expect(await tableNames()).toContain('documents');
  expect(await tableNames()).toContain('document_files');
});

it('uses a decodable PNG fixture', () => {
  // Guards the bytes above: the corrupted-file feedback is verified in the
  // client test, so this one failing later is about the app, not the fixture.
  expect(VALID_PNG.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
});
