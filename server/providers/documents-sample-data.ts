import type {
  AdministratedUser,
  UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';

import type { DocumentRecord } from './document-types.js';

const OWNER_SET = 'document-maintainer';
const READER_SET = 'document-reader';
const PASSWORD = 'Demo123456!';

const samples: readonly Omit<
  DocumentRecord,
  'id' | 'ownerId' | 'ownerName' | 'createdAt' | 'updatedAt'
>[] = [
  {
    title: '公开资料 P',
    body: '这是已经发布、且不保密的虚构资料 P。所有具有资料阅读资格的同事都可以阅读。\n\n资料内容仅用于演示，不代表任何真实业务。',
    published: true,
    confidential: false,
  },
  {
    title: '私有草稿 D',
    body: '这是尚未发布的虚构草稿 D，默认只有负责人资料员甲可以查看。\n\n资料员甲可以临时把这一份草稿开放给阅读者乙，但不会开放甲的其他草稿。',
    published: false,
    confidential: false,
  },
  {
    title: '保密资料 C',
    body: '这是虚构的保密资料 C。因为它是保密资料，阅读者乙不能在资料列表中看到它；负责人资料员甲仍然可以正常读取正文。',
    published: true,
    confidential: true,
  },
];

async function ensureUser(
  users: UserAdministrationService,
  input: {
    name: string;
    username: string;
    email: string;
    password: string;
  },
): Promise<AdministratedUser> {
  const page = await users.list({
    search: input.username,
    pageSize: 50,
    kind: 'person',
  });
  let user = page.items.find(
    (item) => item.username === input.username || item.email === input.email,
  );
  if (!user) {
    user = await users.create(input);
  }
  return user;
}

async function ensureAssignment(
  authz: AppAuthorization,
  permissionSet: string,
  user: AdministratedUser,
): Promise<void> {
  const assignments = await authz.permissionSets.listAssignments(permissionSet);
  if (
    assignments.some(
      (assignment) =>
        assignment.subject.type === 'user' && assignment.subject.id === user.id,
    )
  ) {
    return;
  }
  await authz.permissionSets.assign({
    permissionSet,
    subject: { type: 'user', id: user.id },
  });
}

/**
 * Three fictional documents and the two business accounts. It is a sample
 * registration rather than a seed because creating a person has to go through
 * Users, while documents are ordinary application rows.
 *
 * Demo sign-ins, both with password `Demo123456!`: `jia_demo` (资料员甲,
 * maintainer) and `yi_demo` (阅读者乙, reader).
 */
export async function buildDocumentsSampleData(
  authz: AppAuthorization,
  database: DatabaseManager,
  users: UserAdministrationService,
): Promise<void> {
  if (!(await authz.permissionSets.get(OWNER_SET))) {
    throw new Error(`Required permission set ${OWNER_SET} is missing.`);
  }
  if (!(await authz.permissionSets.get(READER_SET))) {
    throw new Error(`Required permission set ${READER_SET} is missing.`);
  }

  const jia = await ensureUser(users, {
    name: '资料员甲',
    username: 'jia_demo',
    email: 'jia@example.com',
    password: PASSWORD,
  });
  const yi = await ensureUser(users, {
    name: '阅读者乙',
    username: 'yi_demo',
    email: 'yi@example.com',
    password: PASSWORD,
  });
  await ensureAssignment(authz, OWNER_SET, jia);
  await ensureAssignment(authz, READER_SET, yi);

  const documents = database.repository<DocumentRecord>('documents');
  const now = new Date();
  for (const sample of samples) {
    const existing = await documents.findOne({
      filter: { title: sample.title },
    });
    if (existing) continue;
    await documents.createOne({
      values: {
        id: crypto.randomUUID(),
        ...sample,
        ownerId: jia.id,
        ownerName: jia.name,
        createdAt: now,
        updatedAt: now,
      },
    });
  }
}
