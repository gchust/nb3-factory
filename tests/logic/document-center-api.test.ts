// @vitest-environment node

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

import { randomUUID } from 'node:crypto';

import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  apiDocsToken,
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
  type ApiDocument,
} from '@nocobase/app-server/router';
import { expect } from 'vitest';

import { createStandaloneServer } from '../../server/standalone.ts';

const test = createAppTest({
  createServer: createStandaloneServer,
  server: { viteDevUrl: false },
  // A test request carries no listener origin, so name the test origin as trusted
  // as a deployment's `APP_PUBLIC_ORIGIN` does; a cookie write must declare one.
  config: {
    auth: {
      baseURL: 'http://localhost',
      trustedOrigins: ['http://localhost'],
    },
  },
});

/** The origin the test requests are addressed to; a cookie-authenticated write names it as a browser would. */
const BROWSER_ORIGIN = 'http://localhost';

/** A JSON write initiated from the application's own origin. */
function writeJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BROWSER_ORIGIN },
    body: JSON.stringify(body),
  };
}

test('an anonymous caller is refused and a member is not an administrator', async ({
  testApp,
}) => {
  const anonymous = await testApp.request('/documents');
  expect(anonymous.status).toBe(401);
  const anonymousAdmin = await testApp.request('/documentBackups');
  expect(anonymousAdmin.status).toBe(401);

  const email = `member-${randomUUID()}@example.com`;
  const password = 'member-password-123';
  const signUp = await testApp.request('/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Regular Member' }),
  });
  expect(signUp.status).toBe(200);

  const member = await signIn(testApp, { email, password });

  // The employee surface answers a session.
  const documents = await member.fetch('/documents');
  expect(documents.status).toBe(200);
  const body = (await documents.json()) as {
    data: { code: string | null }[];
  };
  expect(Array.isArray(body.data)).toBe(true);
  expect(body.data.length).toBeGreaterThan(0);

  // The administration surface does not: a member has no `manage` grant.
  expect((await member.fetch('/documentBackups')).status).toBe(403);
  expect((await member.fetch('/departments')).status).toBe(403);

  // A document restricted to another department is refused, not returned.
  const hidden = await testApp.connection
    .repository('documents')
    .findOne({ filter: { code: 'security-policy' } });
  expect(hidden).toBeDefined();
  const forbidden = await member.fetch(`/documents/${hidden!.id}`);
  expect(forbidden.status).toBe(403);
  const error = (await forbidden.json()) as {
    error: { reason: string; domain: string };
  };
  expect(error.error).toMatchObject({
    reason: 'DOCUMENT_ACCESS_DENIED',
    domain: 'documentCenter',
  });
});

test('a member reads a version history with its server-resolved modifier', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  // The administrator creates a company-wide document, so its version carries
  // a known modifier without touching the seeded documents or matching any
  // later question in this file.
  const created = await admin.fetch(
    '/documents',
    writeJson({
      title: `版本修改人测试-${randomUUID()}`,
      category: 'policy',
      content: '办公区域绿植由综合行政部统一养护。',
      status: 'published',
      visibility: 'all',
      changeNote: '接口测试创建',
    }),
  );
  expect(created.status).toBe(201);
  const createdBody = (await created.json()) as { data: { id: number } };
  const documentId = createdBody.data.id;

  const email = `reader-${randomUUID()}@example.com`;
  const password = 'reader-password-123';
  const signUp = await testApp.request('/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Reader' }),
  });
  expect(signUp.status).toBe(200);
  const member = await signIn(testApp, { email, password });

  // The version response itself carries the modifier, so a reader without the
  // `manage` action still sees who changed a version.
  const versions = await member.fetch(`/documents/${documentId}/versions`);
  expect(versions.status).toBe(200);
  const body = (await versions.json()) as {
    data: {
      version: number;
      createdById: string | null;
      createdByName: string | null;
    }[];
  };
  const latest = body.data[0]!;
  expect(latest.createdById).toBeTruthy();
  expect(latest.createdByName).toBeTruthy();
  // The reader still cannot reach the administrator directory at all.
  expect((await member.fetch('/directoryUsers?limit=100')).status).toBe(403);
});

test('an administrator uses the whole center through its routes', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const documents = await admin.fetch('/documents?pageSize=50');
  expect(documents.status).toBe(200);
  const list = (await documents.json()) as {
    data: { id: number; code: string | null; version: number }[];
    meta: { total: number };
  };
  expect(list.meta.total).toBeGreaterThan(0);
  const travel = list.data.find(
    (document) => document.code === 'travel-reimbursement',
  );
  expect(travel).toBeDefined();

  const versions = await admin.fetch(`/documents/${travel!.id}/versions`);
  expect(versions.status).toBe(200);
  const versionBody = (await versions.json()) as {
    data: { version: number }[];
  };
  expect(versionBody.data.map((version) => version.version)).toEqual([2, 1]);

  const departments = await admin.fetch('/departments');
  expect(departments.status).toBe(200);

  const backup = await admin.fetch(
    '/documentBackups',
    writeJson({ title: '接口测试备份' }),
  );
  expect(backup.status).toBe(201);
  const backupBody = (await backup.json()) as { data: { id: number } };
  const backupId = backupBody.data.id;

  const impact = await admin.fetch(`/documentBackups/${backupId}/impact`);
  expect(impact.status).toBe(200);

  // A restore without `confirm: true` is refused before anything changes.
  const unconfirmed = await admin.fetch(
    `/documentBackups/${backupId}/restore`,
    writeJson({}),
  );
  expect(unconfirmed.status).toBe(400);

  const restored = await admin.fetch(
    `/documentBackups/${backupId}/restore`,
    writeJson({ confirm: true }),
  );
  expect(restored.status).toBe(200);

  // Asking a question returns citations of readable documents.
  const answer = await admin.fetch(
    '/documents/ask',
    writeJson({ question: '出差怎么报销' }),
  );
  expect(answer.status).toBe(200);
  const answerBody = (await answer.json()) as {
    data: { hasAnswer: boolean; citations: { title: string }[] };
  };
  expect(answerBody.data.hasAnswer).toBe(true);
  expect(answerBody.data.citations[0]?.title).toBe('差旅费报销管理办法');
});

test('declares every route and response in the API document', async ({
  testApp,
}) => {
  expect(findUndeclaredApiRoutes(testApp.application)).toEqual([]);

  const document = (await testApp.application.container
    .resolve(apiDocsToken)
    .getDocument()) as ApiDocument;
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);

  const listDocuments = document.paths?.['/api/documents']?.get;
  expect(listDocuments?.operationId).toBe('documentCenterListDocuments');
  expect(Object.keys(listDocuments?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '500',
  ]);

  const createDepartment = document.paths?.['/api/departments']?.post;
  expect(createDepartment?.operationId).toBe('documentCenterCreateDepartment');
  expect(Object.keys(createDepartment?.responses ?? {}).sort()).toEqual([
    '201',
    '400',
    '401',
    '403',
    '409',
    '500',
  ]);

  const restoreBackup =
    document.paths?.['/api/documentBackups/{backupId}/restore']?.post;
  expect(restoreBackup?.operationId).toBe('documentCenterRestoreBackup');
  expect(Object.keys(restoreBackup?.responses ?? {}).sort()).toEqual([
    '200',
    '400',
    '401',
    '403',
    '404',
    '500',
  ]);
});
