import type { Application } from '@nocobase/app-server/application';
import {
  userAdministrationServiceToken,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

import {
  LIBRARY_MAINTAINER_SET,
  LIBRARY_READER_SET,
  buildLibraryPermissionSets,
} from './permission-sets.js';
import { DOCUMENTS_COLLECTION, type Document } from './resources.js';

/**
 * The completion boundary of one-time provisioning.
 *
 * The first successful boot writes this marker, after the permission sets,
 * the two accounts, their assignments and the sample documents all exist. A
 * later boot sees it and stops, which is what keeps an administrator's edits
 * and removals final: a permission set they renamed or an assignment they
 * revoked is not undone by restarting the server.
 */
const PROVISIONING_COLLECTION = 'libraryProvisioning';
const PROVISIONING_MARKER = 'document-library-sample-data';

/** The two demonstration accounts the original task names. */
interface SampleAccount {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly permissionSet: string;
}

const SAMPLE_ACCOUNTS: readonly SampleAccount[] = [
  {
    username: 'jia',
    name: '资料员甲',
    email: 'jia@example.invalid',
    password: 'admin123',
    permissionSet: LIBRARY_MAINTAINER_SET,
  },
  {
    username: 'readeryi',
    name: 'Reader Yi',
    email: 'readeryi@example.invalid',
    password: 'admin123',
    permissionSet: LIBRARY_READER_SET,
  },
];

/**
 * The sample documents the task calls P, D and C. The `code` is the stable
 * identity they are matched by, so a re-run of a partially applied provision
 * cannot duplicate them.
 */
interface SampleDocument {
  readonly code: string;
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

const SAMPLE_DOCUMENTS: readonly SampleDocument[] = [
  {
    code: 'P',
    title: '员工手册',
    body: '面向全体的公开资料，任何有阅读资格的同时都可以查看。',
    published: true,
    confidential: false,
  },
  {
    code: 'D',
    title: '预算草案',
    body: '尚未发布的草稿，只有负责人本人可见。',
    published: false,
    confidential: false,
  },
  {
    code: 'C',
    title: '保密协议',
    body: '保密资料，即使共享给他人，也不会对非负责人开放。',
    published: true,
    confidential: true,
  },
];

/**
 * Creates the demonstration accounts, their permission-set assignments and the
 * sample documents exactly once.
 *
 * Everything here is create-if-missing, never update, and the marker written
 * at the end is what stops the routine from running again. It deliberately
 * never enables or disables an account and never overwrites a permission set:
 * those are the administrator's to change after installation.
 */
export async function provisionDocumentLibrary(
  app: Application,
): Promise<void> {
  const database = app.container.resolve(databaseManagerToken);

  // The provisioning marker collection is created by a migration. When it is
  // absent the schema was never installed — an application constructed without
  // running migrations, such as an embedded runtime against a fixture root —
  // and provisioning has nothing safe to write to.
  if (!(await database.collections().get(PROVISIONING_COLLECTION))) {
    return;
  }

  const provisioning = database.repository(PROVISIONING_COLLECTION);

  const done = await provisioning.findOne({
    filter: { key: PROVISIONING_MARKER },
  });
  if (done) {
    return;
  }

  const authz = app.container.resolve<AppAuthorization>(authorizationToken);
  const users = app.container.resolve(userAdministrationServiceToken);

  await ensurePermissionSets(authz);

  for (const account of SAMPLE_ACCOUNTS) {
    const user = await findOrCreateUser(users, account);
    await ensureAssignment(authz, account.permissionSet, user.id);
  }

  const owner = await findUserByUsername(users, 'jia');
  if (owner) {
    await ensureSampleDocuments(database, owner.id);
  }

  await provisioning.createOne({
    values: {
      key: PROVISIONING_MARKER,
      createdAt: new Date(),
    },
  });
}

/** Writes each declared permission set only when it does not already exist. */
async function ensurePermissionSets(authz: AppAuthorization): Promise<void> {
  for (const definition of buildLibraryPermissionSets(authz)) {
    if (await authz.permissionSets.get(definition.key)) {
      continue;
    }
    await authz.permissionSets.create(definition);
  }
}

/**
 * Finds an account by its username, creating it when absent. An account that
 * already exists is returned exactly as it is: this routine never changes a
 * name, an email, a password, or whether the account is enabled.
 */
async function findOrCreateUser(
  users: UserAdministrationService,
  account: SampleAccount,
): Promise<{ id: string }> {
  const existing = await findUserByUsername(users, account.username);
  if (existing) {
    return existing;
  }
  const created = await users.create({
    name: account.name,
    username: account.username,
    email: account.email,
    password: account.password,
  });
  return { id: created.id };
}

async function findUserByUsername(
  users: UserAdministrationService,
  username: string,
): Promise<{ id: string } | undefined> {
  const page = await users.list({ search: username, pageSize: 100 });
  const match = page.items.find((item) => item.username === username);
  return match ? { id: match.id } : undefined;
}

/** Assigns a permission set to a user only when that exact assignment is absent. */
async function ensureAssignment(
  authz: AppAuthorization,
  permissionSet: string,
  userId: string,
): Promise<void> {
  const assignments = await authz.permissionSets.listAssignments(permissionSet);
  const assigned = assignments.some(
    (assignment) =>
      assignment.subject.type === 'user' && assignment.subject.id === userId,
  );
  if (assigned) {
    return;
  }
  await authz.permissionSets.assign({
    permissionSet,
    subject: { type: 'user', id: userId },
  });
}

/** Creates the sample documents by their stable `code`, skipping any present. */
async function ensureSampleDocuments(
  database: DatabaseManager,
  ownerId: string,
): Promise<void> {
  if (!(await database.collections().get(DOCUMENTS_COLLECTION))) {
    return;
  }
  const documents = database.repository<Document>(DOCUMENTS_COLLECTION);
  for (const sample of SAMPLE_DOCUMENTS) {
    const existing = await documents.findOne({ filter: { code: sample.code } });
    if (existing) {
      continue;
    }
    const now = new Date();
    await documents.createOne({
      values: {
        id: randomUUID(),
        code: sample.code,
        title: sample.title,
        body: sample.body,
        ownerId,
        published: sample.published,
        confidential: sample.confidential,
        createdAt: now,
        updatedAt: now,
      },
    });
  }
}
