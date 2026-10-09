// @vitest-environment node

import { createStandaloneServer } from '../../server/standalone.js';
import { createTestApp, type TestApp } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
  type TestSession,
} from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const LIBRARIAN = { username: 'librarian', password: 'librarian123' };
const READER = { username: 'reader', password: 'reader123' };

interface DocumentView {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string | null;
  published: boolean;
  confidential: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface ListBody {
  data: DocumentView[];
  meta: { page: number; pageSize: number; total: number; canCreate: boolean };
}

let app: TestApp;
let admin: TestSession;
let librarian: TestSession;
let reader: TestSession;

async function list(session: TestSession): Promise<ListBody> {
  const response = await session.fetch('/library/documents');
  expect(response.status).toBe(200);
  return (await response.json()) as ListBody;
}

function byTitle(body: ListBody, title: string): DocumentView | undefined {
  return body.data.find((document) => document.title === title);
}

/**
 * A cookie-authenticated write. A browser sends its own `Origin`; a `TestSession` does not, so a write sent without one
 * is refused with `INVALID_CSRF_ORIGIN`. Sending the application's own origin is what a real client does.
 */
function mutate(
  session: TestSession,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return session.fetch(path, {
    ...init,
    headers: {
      Origin: 'http://localhost',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

describe('document library API', () => {
  beforeAll(async () => {
    app = await createTestApp({
      createServer: createStandaloneServer,
      // The application must know its own origin, or a cookie write from a test
      // client is refused as an untrusted one before any route runs.
      config: { app: { publicOrigin: 'http://localhost' } },
    });
    admin = await signIn(app, DEFAULT_ADMIN_CREDENTIALS);
    librarian = await signIn(app, LIBRARIAN);
    reader = await signIn(app, READER);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
  });

  it('requires a session', async () => {
    const response = await app.request('/library/documents');
    expect(response.status).toBe(401);
  });

  it('shows the librarian all their own documents, including draft and confidential', async () => {
    const body = await list(librarian);
    expect(body.meta.total).toBe(3);
    const titles = body.data.map((document) => document.title).sort();
    expect(titles).toEqual(['公开资料 P', '保密资料 C', '私有草稿 D'].sort());
    for (const document of body.data) {
      expect(document.ownerId).toBe(librarian.user.id);
      expect(document.ownerName).toBe('资料员甲');
      expect(document.canEdit).toBe(true);
      expect(document.canDelete).toBe(true);
    }
    // The librarian may create documents, so the list may offer "New".
    expect(body.meta.canCreate).toBe(true);
  });

  it('shows a reader only the published, non-confidential document', async () => {
    const body = await list(reader);
    expect(body.meta.total).toBe(1);
    expect(body.data[0]?.title).toBe('公开资料 P');
    expect(body.data[0]?.ownerName).toBe('资料员甲');
    expect(body.data[0]?.canEdit).toBe(false);
    expect(body.data[0]?.canDelete).toBe(false);
    // A reader cannot create documents, so the list hides "New".
    expect(body.meta.canCreate).toBe(false);
  });

  it('hides a draft and a confidential document from a reader', async () => {
    const own = await list(librarian);
    const draft = byTitle(own, '私有草稿 D');
    const confidential = byTitle(own, '保密资料 C');
    expect(draft).toBeDefined();
    expect(confidential).toBeDefined();

    const draftResponse = await reader.fetch(`/library/documents/${draft!.id}`);
    expect(draftResponse.status).toBe(404);
    const confidentialResponse = await reader.fetch(
      `/library/documents/${confidential!.id}`,
    );
    expect(confidentialResponse.status).toBe(404);
  });

  it('refuses a reader write operations', async () => {
    const created = await mutate(reader, '/library/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '阅读者新建' }),
    });
    expect(created.status).toBe(403);

    const own = await list(librarian);
    const publicDocument = byTitle(own, '公开资料 P')!;
    const updated = await mutate(
      reader,
      `/library/documents/${publicDocument.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '阅读者改名' }),
      },
    );
    expect(updated.status).toBe(403);

    const removed = await mutate(
      reader,
      `/library/documents/${publicDocument.id}`,
      { method: 'DELETE' },
    );
    expect(removed.status).toBe(403);
  });

  it('lets the librarian maintain their own documents', async () => {
    const created = await mutate(librarian, '/library/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '资料员新建的草稿',
        body: '正文',
        published: false,
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { data: DocumentView };
    expect(createdBody.data.canEdit).toBe(true);

    const updated = await mutate(
      librarian,
      `/library/documents/${createdBody.data.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ published: true }),
      },
    );
    expect(updated.status).toBe(200);
    expect(
      ((await updated.json()) as { data: DocumentView }).data.published,
    ).toBe(true);

    const removed = await mutate(
      librarian,
      `/library/documents/${createdBody.data.id}`,
      { method: 'DELETE' },
    );
    expect(removed.status).toBe(204);
  });

  it('temporarily opens one draft to the reader, then revokes it', async () => {
    const own = await list(librarian);
    const draft = byTitle(own, '私有草稿 D')!;
    const authz = app.application.container.resolve(authorizationToken);

    await authz.sharingRules.create({
      key: 'library.test.share-draft',
      resource: { type: 'composite', id: 'library.documents' },
      actions: [
        {
          action: 'view',
          scopeKey: 'documents',
          selection: { type: 'records', ids: [draft.id] },
        },
      ],
      subjects: [{ type: 'user', id: reader.user.id }],
    });

    const shared = await list(reader);
    expect(byTitle(shared, '私有草稿 D')).toBeDefined();
    // The draft is readable but still not writable.
    expect(byTitle(shared, '私有草稿 D')?.canEdit).toBe(false);

    await authz.sharingRules.delete('library.test.share-draft');

    const revoked = await list(reader);
    expect(byTitle(revoked, '私有草稿 D')).toBeUndefined();
    const direct = await reader.fetch(`/library/documents/${draft.id}`);
    expect(direct.status).toBe(404);
  });

  it('keeps a confidential document hidden even when shared with a reader', async () => {
    const own = await list(librarian);
    const confidential = byTitle(own, '保密资料 C')!;
    const authz = app.application.container.resolve(authorizationToken);

    await authz.sharingRules.create({
      key: 'library.test.share-confidential',
      resource: { type: 'composite', id: 'library.documents' },
      actions: [
        {
          action: 'view',
          scopeKey: 'documents',
          selection: { type: 'records', ids: [confidential.id] },
        },
      ],
      subjects: [{ type: 'user', id: reader.user.id }],
    });

    const shared = await list(reader);
    expect(byTitle(shared, '保密资料 C')).toBeUndefined();
    const direct = await reader.fetch(`/library/documents/${confidential.id}`);
    expect(direct.status).toBe(404);

    // The librarian keeps their own access to the confidential document.
    const ownAgain = await list(librarian);
    expect(byTitle(ownAgain, '保密资料 C')).toBeDefined();

    await authz.sharingRules.delete('library.test.share-confidential');
  });

  it('lets the administrator read every document', async () => {
    const body = await list(admin);
    expect(body.meta.total).toBeGreaterThanOrEqual(3);
    expect(byTitle(body, '保密资料 C')).toBeDefined();
  });

  it('invalidates the reader session when the administrator disables the account', async () => {
    // The reader holds a live session that can read the published document.
    expect((await list(reader)).meta.total).toBe(1);

    const administration = app.application.container.resolve(
      userAdministrationServiceToken,
    );
    await administration.disable(reader.user.id);

    // The session that was already signed in no longer authorizes a request.
    const afterDisable = await reader.fetch('/library/documents');
    expect(afterDisable.status).toBe(401);

    // And the account can no longer sign in again.
    await expect(signIn(app, READER)).rejects.toThrow(/403/);
  });
});
