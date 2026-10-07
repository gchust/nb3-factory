// @vitest-environment node
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import {
  createTestAppConfig,
  type TestAppConfig,
} from '@nocobase/app-testing/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LIBRARY_MAINTAINER_SET,
  LIBRARY_READER_SET,
  LIBRARY_RESOURCE_ID,
  LIBRARY_SCOPE,
  PUBLISHED_RECORD_ACCESS,
} from '../../server/library/authorization.js';
import {
  CONFIDENTIAL_DOCUMENT,
  DRAFT_DOCUMENT,
  PUBLIC_DOCUMENT,
} from '../../server/library/seed-data.js';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const PUBLIC_TITLE = PUBLIC_DOCUMENT.title;
const DRAFT_TITLE = DRAFT_DOCUMENT.title;
const CONFIDENTIAL_TITLE = CONFIDENTIAL_DOCUMENT.title;

const DRAFT_SHARE_KEY = 'library.test.shareDraft';
const CONFIDENTIAL_SHARE_KEY = 'library.test.shareConfidential';

interface DocumentEntry {
  readonly id: string;
  readonly title: string;
  readonly confidential: boolean;
}

interface DocumentListBody {
  readonly data: readonly DocumentEntry[];
  readonly meta: {
    readonly total: number;
    readonly canCreate: boolean;
    readonly editableIds: readonly string[];
  };
}

interface AuthorizationOptionsBody {
  readonly data: {
    readonly sections: readonly {
      readonly name: string;
      readonly title: unknown;
      readonly subsections: readonly {
        readonly name: string;
        readonly resources: readonly {
          readonly type: string;
          readonly id: string;
          readonly title: unknown;
          readonly actions: readonly {
            readonly name: string;
            readonly title: unknown;
          }[];
          readonly dataScopes?: Readonly<
            Record<
              string,
              readonly {
                readonly key: string;
                readonly title: unknown;
                readonly recordAccess: readonly string[];
              }[]
            >
          >;
        }[];
      }[];
    }[];
    readonly recordAccess: readonly {
      readonly key: string;
      readonly title: unknown;
    }[];
  };
}

/** A title in this application's namespace, as the workspace renders it translated. */
function title(key: string): { readonly key: string; readonly ns: string } {
  return { key: `library.authorization.${key}`, ns: 'nb3-factory' };
}

/**
 * The key and namespace a workspace title carries, without the English fallback
 * the server derives from the key.
 */
function titleDescriptor(value: unknown): { key: string; ns: string } {
  const title = value as { key: string; ns: string };
  return { key: title.key, ns: title.ns };
}

let server: StandaloneServer;
let config: TestAppConfig;
let baseUrl: string;
let appOrigin: string;
let adminCookie: string;
let maintainerCookie: string;
let readerCookie: string;
let readerId: string;
const documentIds = new Map<string, string>();

beforeAll(async () => {
  config = await createTestAppConfig({
    connections: ['main'],
    install: true,
    config: {
      app: { publicOrigin: 'http://localhost' },
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      users: {
        initialAdmin: {
          username: 'nocobase',
          email: 'admin@nocobase.com',
          password: 'admin123',
        },
      },
    },
  });
  server = await createStandaloneServer({
    configPath: config.path,
    viteDevUrl: false,
  });
  baseUrl = `http://localhost${server.application.publicBasePath}`;
  appOrigin = new URL(baseUrl).origin;

  adminCookie = await signIn('nocobase', 'admin123');
  maintainerCookie = await signIn('jia', 'Jia12345678');
  readerCookie = await signIn('yi.reader', 'Yi12345678');

  const users = server.application.container.resolve(
    userAdministrationServiceToken,
  );
  const reader = (await users.list({ search: 'yi', pageSize: 50 })).items.find(
    (user) => user.username === 'yi.reader',
  );
  if (!reader) {
    throw new Error('The reader account was not provisioned.');
  }
  readerId = reader.id;

  for (const document of (await listDocuments(maintainerCookie)).data) {
    documentIds.set(document.title, document.id);
  }
}, 120_000);

afterAll(async () => {
  await server?.close();
  await config?.dispose();
});

describe('document library', () => {
  it('lets the maintainer read, create and edit their own documents', async () => {
    const list = await listDocuments(maintainerCookie);
    expect(list.data.map((document) => document.title).sort()).toEqual(
      [PUBLIC_TITLE, DRAFT_TITLE, CONFIDENTIAL_TITLE].sort(),
    );
    expect(list.meta.canCreate).toBe(true);
    // Every seeded document belongs to the maintainer, so all are editable.
    expect([...list.meta.editableIds].sort()).toEqual(
      list.data.map((document) => document.id).sort(),
    );

    const created = await request('/api/documents', maintainerCookie, {
      method: 'POST',
      body: {
        title: '新员工入职指南',
        body: '正文',
        published: false,
        confidential: false,
      },
    });
    expect(created.status).toBe(200);
  });

  it('shows the reader only the published, non-confidential documents, read-only', async () => {
    const list = await listDocuments(readerCookie);
    expect(list.data.map((document) => document.title)).toEqual([PUBLIC_TITLE]);
    expect(list.data[0]?.confidential).toBe(false);
    // Reading does not imply editing: no create control, no editable row.
    expect(list.meta.canCreate).toBe(false);
    expect(list.meta.editableIds).toEqual([]);
  });

  it('refuses an edit by the reader', async () => {
    const response = await request(
      `/api/documents/${documentId(PUBLIC_TITLE)}`,
      readerCookie,
      {
        method: 'PATCH',
        body: {
          title: '篡改',
          body: '',
          published: true,
          confidential: false,
        },
      },
    );
    expect(response.status).toBe(403);
  });

  it('offers every seeded document to the sharing record picker', async () => {
    // The administrator picks the draft by id here, which is the single-record
    // share the acceptance review exercises.
    const response = await request(
      '/api/authorization/sharingRules/records/documents?pageSize=100',
      adminCookie,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: readonly { id: string; label: string }[];
    };
    expect(body.data.map((option) => option.id)).toEqual(
      expect.arrayContaining([
        documentId(PUBLIC_TITLE),
        documentId(DRAFT_TITLE),
        documentId(CONFIDENTIAL_TITLE),
      ]),
    );
  });

  it('opens one draft to the reader while shared and closes it again on revoke', async () => {
    await createSharingRule(DRAFT_SHARE_KEY, documentId(DRAFT_TITLE));

    const shared = await listDocuments(readerCookie);
    expect(shared.data.map((document) => document.title).sort()).toEqual(
      [PUBLIC_TITLE, DRAFT_TITLE].sort(),
    );
    // Sharing widens exactly one record for reading: the shared draft is visible
    // but still not editable, and no other draft joins the list.
    expect(shared.meta.editableIds).toEqual([]);
    expect(shared.meta.canCreate).toBe(false);

    const refused = await request(
      `/api/documents/${documentId(DRAFT_TITLE)}`,
      readerCookie,
      {
        method: 'PATCH',
        body: { title: '篡改', body: '', published: true, confidential: false },
      },
    );
    expect(refused.status).toBe(403);

    await revokeSharingRule(DRAFT_SHARE_KEY);

    const revoked = await listDocuments(readerCookie);
    expect(revoked.data.map((document) => document.title)).toEqual([
      PUBLIC_TITLE,
    ]);
  });

  it('keeps a confidential document hidden from the reader even when shared', async () => {
    await createSharingRule(
      CONFIDENTIAL_SHARE_KEY,
      documentId(CONFIDENTIAL_TITLE),
    );

    const reader = await listDocuments(readerCookie);
    expect(reader.data.map((document) => document.title)).toEqual([
      PUBLIC_TITLE,
    ]);

    // Sharing a confidential document never restricts its owner.
    const maintainer = await listDocuments(maintainerCookie);
    expect(maintainer.data.map((document) => document.title)).toContain(
      CONFIDENTIAL_TITLE,
    );

    await revokeSharingRule(CONFIDENTIAL_SHARE_KEY);
  }, 30_000);

  it('provisions the reader without the maintainer permission set', async () => {
    const authz = authorization();
    const assignments = await authz.permissionSets.listAssignments();
    const forReader = assignments
      .filter(
        (assignment) =>
          assignment.subject.type === 'user' &&
          assignment.subject.id === readerId,
      )
      .map((assignment) => assignment.permissionSet);
    expect(forReader).toContain(LIBRARY_READER_SET);
    expect(forReader).not.toContain(LIBRARY_MAINTAINER_SET);
  });

  it('lists the library in the permission workspace an administrator configures', async () => {
    const response = await request(
      '/api/authorization/permissionSets/options',
      adminCookie,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as AuthorizationOptionsBody;

    const business = body.data.sections.find(
      (entry) => entry.name === 'business',
    );
    const subsection = business?.subsections.find(
      (entry) => entry.name === 'library',
    );
    expect(subsection).toBeDefined();
    expect(titleDescriptor(subsection?.title)).toEqual(title('resource'));

    const resource = subsection?.resources.find(
      (entry) => entry.id === LIBRARY_RESOURCE_ID,
    );
    expect(resource?.type).toBe('composite');
    expect(titleDescriptor(resource?.title)).toEqual(title('resource'));
    expect(
      resource?.actions.map((action) => titleDescriptor(action.title)),
    ).toEqual([
      title('permission.view'),
      title('permission.create'),
      title('permission.edit'),
    ]);
    expect(resource?.dataScopes?.view?.[0]?.key).toBe(LIBRARY_SCOPE);
    expect(resource?.dataScopes?.view?.[0]?.recordAccess).toContain(
      PUBLISHED_RECORD_ACCESS,
    );

    const recordAccess = body.data.recordAccess.find(
      (entry) => entry.key === PUBLISHED_RECORD_ACCESS,
    );
    expect(titleDescriptor(recordAccess?.title)).toEqual(
      title('recordAccess.published'),
    );
  });

  // Last, because it leaves the reader disabled: disabling an account must end the sessions it already holds, not
  // only refuse the next sign-in. The account state lives in the users settings API, which the Users page calls.
  it('ends the reader session an administrator disables', async () => {
    expect((await request('/api/documents', readerCookie)).status).toBe(200);

    const disabled = await request(
      `/api/users/${readerId}/disable`,
      adminCookie,
      { method: 'POST' },
    );
    expect(disabled.status).toBe(200);

    expect((await request('/api/documents', readerCookie)).status).toBe(401);
  });
});

function documentId(title: string): string {
  const id = documentIds.get(title);
  if (!id) {
    throw new Error(`The seed document "${title}" was not provisioned.`);
  }
  return id;
}

function authorization(): AppAuthorization {
  return server.application.container.resolve(authorizationToken);
}

/** Through the settings API the administrator's Sharing Rules page calls. */
async function createSharingRule(key: string, documentId: string) {
  const response = await request(
    '/api/authorization/sharingRules',
    adminCookie,
    {
      method: 'POST',
      body: {
        key,
        title: 'Temporarily open a document to a colleague',
        resource: { type: 'composite', id: LIBRARY_RESOURCE_ID },
        actions: [
          {
            action: 'view',
            scopeKey: LIBRARY_SCOPE,
            selection: { type: 'records', ids: [documentId] },
          },
        ],
        subjects: [{ type: 'user', id: readerId }],
        reason: 'A one-record share used by the acceptance review',
      },
    },
  );
  expect(response.status).toBe(201);
}

async function revokeSharingRule(key: string) {
  const response = await request(
    `/api/authorization/sharingRules/${key}`,
    adminCookie,
    { method: 'DELETE' },
  );
  expect([200, 204]).toContain(response.status);
}

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

async function listDocuments(cookie: string): Promise<DocumentListBody> {
  const response = await request('/api/documents', cookie);
  expect(response.status).toBe(200);
  return (await response.json()) as DocumentListBody;
}

async function request(
  path: string,
  cookie: string,
  options: { method?: string; body?: unknown } = {},
): Promise<Response> {
  return server.fetch(
    new Request(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        cookie,
        origin: appOrigin,
        ...(options.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}
