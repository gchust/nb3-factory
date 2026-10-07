// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { DatabaseManager } from '@nocobase/db';
import { expect } from 'vitest';

import {
  DocumentCenterError,
  DocumentCenterService,
  type DocumentRecord,
  type DepartmentRecord,
} from '../../server/providers/document-center.ts';

const databasePackageName = '@nocobase/nb3-factory';
const migrations = [
  {
    packageName: databasePackageName,
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
    extensions: ['.ts'],
  },
];
const seeds = [
  {
    packageName: databasePackageName,
    directory: fileURLToPath(
      new URL('../../database/main/seeds', import.meta.url),
    ),
    extensions: ['.ts'],
  },
];

const test = createDatabaseTest({ migrations, seeds });

function service(database: DatabaseManager): DocumentCenterService {
  return new DocumentCenterService(database);
}

async function findByCode(
  database: DatabaseManager,
  code: string,
): Promise<DocumentRecord> {
  const document = await database
    .connection()
    .repository<DocumentRecord>('documents')
    .findOne({ filter: { code } });
  if (!document) throw new Error(`Seed document ${code} is missing.`);
  return document;
}

async function departmentByCode(
  database: DatabaseManager,
  code: string,
): Promise<DepartmentRecord> {
  const department = await database
    .connection()
    .repository<DepartmentRecord>('departments')
    .findOne({ filter: { code } });
  if (!department) throw new Error(`Seed department ${code} is missing.`);
  return department;
}

async function joinDepartment(
  database: DatabaseManager,
  userId: string,
  departmentCode: string,
): Promise<void> {
  const department = await departmentByCode(database, departmentCode);
  await database
    .connection()
    .repository('departmentMembers')
    .createOne({
      values: {
        departmentId: department.id,
        userId,
        primary: false,
        createdAt: new Date(),
      },
    });
}

test('an employee only lists documents their departments may read', async ({
  database,
}) => {
  await joinDepartment(database, 'employee-finance', 'finance');
  const documents = service(database);

  const page = await documents.listDocuments({
    actorId: 'employee-finance',
    actorCanManage: false,
    page: 1,
    pageSize: 50,
  });
  const codes = page.items.map((document) => document.code);

  // Everyone sees the company-wide documents.
  expect(codes).toContain('employee-handbook');
  expect(codes).toContain('travel-reimbursement');
  // The finance department's restricted documents, and finance+hr's shared one.
  expect(codes).toContain('expense-template');
  expect(codes).toContain('contract-template');
  // Another department's restricted document is absent.
  expect(codes).not.toContain('security-policy');

  const hidden = await findByCode(database, 'security-policy');
  await expect(
    documents.getDocument({
      actorId: 'employee-finance',
      actorCanManage: false,
      documentId: hidden.id,
    }),
  ).rejects.toMatchObject<Partial<DocumentCenterError>>({
    code: 'DOCUMENT_ACCESS_DENIED',
  });
});

test('an administrator additionally sees drafts and deleted documents', async ({
  database,
}) => {
  const documents = service(database);
  const draft = await documents.createDocument({
    actorId: 'admin',
    values: {
      title: '在修订的制度',
      code: 'draft-policy',
      category: 'policy',
      content: '这是一份尚未发布的草稿。',
      status: 'draft',
      visibility: 'all',
    },
  });

  const employee = await documents.listDocuments({
    actorId: 'employee-none',
    actorCanManage: false,
    page: 1,
    pageSize: 50,
  });
  expect(employee.items.map((item) => item.code)).not.toContain('draft-policy');

  const admin = await documents.listDocuments({
    actorId: 'admin',
    actorCanManage: true,
    page: 1,
    pageSize: 50,
  });
  expect(admin.items.map((item) => item.code)).toContain('draft-policy');

  await documents.deleteDocument({ actorId: 'admin', documentId: draft.id });
  const active = await documents.listDocuments({
    actorId: 'admin',
    actorCanManage: true,
    deleted: 'exclude',
    page: 1,
    pageSize: 50,
  });
  expect(active.items.map((item) => item.code)).not.toContain('draft-policy');
  const deleted = await documents.listDocuments({
    actorId: 'admin',
    actorCanManage: true,
    deleted: 'only',
    page: 1,
    pageSize: 50,
  });
  expect(deleted.items.map((item) => item.code)).toEqual(['draft-policy']);
});

test('a question cites accessible paragraphs and never a hidden document', async ({
  database,
}) => {
  await joinDepartment(database, 'employee-finance', 'finance');
  const documents = service(database);

  const answered = await documents.ask({
    actorId: 'employee-finance',
    question: '出差怎么报销',
  });
  expect(answered.hasAnswer).toBe(true);
  expect(answered.citations[0]?.title).toBe('差旅费报销管理办法');

  // The only paragraphs that mention terminals and patches are in the
  // technology department's security policy, which this asker cannot read.
  const question = '终端安全软件补丁怎么安装';
  const unanswered = await documents.ask({
    actorId: 'employee-finance',
    question,
  });
  expect(unanswered).toEqual({ hasAnswer: false, citations: [] });

  // The technology department sees it.
  await joinDepartment(database, 'employee-tech', 'tech');
  const forTech = await documents.ask({
    actorId: 'employee-tech',
    question,
  });
  expect(forTech.hasAnswer).toBe(true);
  expect(forTech.citations[0]?.title).toBe('信息安全管理制度');

  const logged = await database
    .connection()
    .repository('documentQuestions')
    .findMany({ filter: { userId: 'employee-finance' } });
  expect(logged).toHaveLength(2);
});

test('an edit keeps the old version and restoring a version brings it back', async ({
  database,
}) => {
  const documents = service(database);
  const created = await documents.createDocument({
    actorId: 'admin',
    values: {
      title: '办公用品领用办法',
      code: 'office-supplies',
      category: 'policy',
      content: '# 办公用品领用办法\n\n## 领用\n\n员工按需领用办公用品。',
      status: 'published',
      visibility: 'all',
    },
  });
  expect(created.version).toBe(1);

  const updated = await documents.updateDocument({
    actorId: 'admin',
    documentId: created.id,
    values: {
      content:
        '# 办公用品领用办法\n\n## 领用\n\n员工每季度可领用一次，需主管审批。',
      changeNote: '增加审批要求',
    },
  });
  expect(updated.version).toBe(2);

  const restored = await documents.restoreVersion({
    actorId: 'admin',
    documentId: created.id,
    version: 1,
    changeNote: '恢复原版本',
  });
  // Restoring writes a new version rather than deleting history.
  expect(restored.version).toBe(3);
  expect(restored.content).toContain('员工按需领用办公用品');
  expect(restored.content).not.toContain('主管审批');

  const versions = await documents.listVersions({
    actorId: 'admin',
    actorCanManage: true,
    documentId: created.id,
  });
  expect(versions.map((version) => version.version)).toEqual([3, 2, 1]);
  expect(versions[2]?.content).toContain('员工按需领用办公用品');
  expect(versions[1]?.changeNote).toBe('增加审批要求');
});

test('an update from a stale version is refused', async ({ database }) => {
  const documents = service(database);
  const created = await documents.createDocument({
    actorId: 'admin',
    values: {
      title: '会议室使用规定',
      category: 'policy',
      content: '会议室使用规定。',
      visibility: 'all',
    },
  });
  await documents.updateDocument({
    actorId: 'admin',
    documentId: created.id,
    values: { content: '会议室使用规定（修订）。' },
  });
  await expect(
    documents.updateDocument({
      actorId: 'admin',
      documentId: created.id,
      values: { content: '另一次修改。', expectedVersion: 1 },
    }),
  ).rejects.toMatchObject<Partial<DocumentCenterError>>({
    code: 'DOCUMENT_VERSION_CONFLICT',
  });
});

test('a deleted document is hidden, then restored unchanged', async ({
  database,
}) => {
  const documents = service(database);
  const target = await findByCode(database, 'employee-handbook');

  await documents.deleteDocument({
    actorId: 'admin',
    documentId: target.id,
  });

  await expect(
    documents.getDocument({
      actorId: 'employee-any',
      actorCanManage: false,
      documentId: target.id,
    }),
  ).rejects.toMatchObject<Partial<DocumentCenterError>>({
    code: 'DOCUMENT_ACCESS_DENIED',
  });

  const restored = await documents.restoreDocument({
    documentId: target.id,
  });
  expect(restored.deletedAt).toBeNull();
  expect(restored.version).toBe(target.version);
  expect(restored.title).toBe(target.title);
});

test('a backup reports its impact and a confirmed restore reverts to it', async ({
  database,
}) => {
  const documents = service(database);
  const travel = await findByCode(database, 'travel-reimbursement');

  const backup = await documents.createBackup({
    actorId: 'admin',
    title: '上线前备份',
  });

  // After the backup: change a document, add one, and delete one.
  await documents.updateDocument({
    actorId: 'admin',
    documentId: travel.id,
    values: { summary: '被修改过的摘要。' },
  });
  await documents.createDocument({
    actorId: 'admin',
    values: {
      title: '备份之后新增的制度',
      code: 'added-after-backup',
      category: 'policy',
      content: '备份之后新增。',
      visibility: 'all',
    },
  });
  const handbook = await findByCode(database, 'employee-handbook');
  await documents.deleteDocument({
    actorId: 'admin',
    documentId: handbook.id,
  });

  const impact = await documents.getBackupImpact(backup.id);
  expect(impact.summary.update).toBeGreaterThanOrEqual(1);
  // The document deleted after the backup is brought back...
  expect(impact.summary.restore).toBeGreaterThanOrEqual(1);
  // ...and the one created after it is removed by the restore.
  expect(impact.summary.delete).toBeGreaterThanOrEqual(1);
  expect(impact.summary.total).toBeGreaterThan(0);
  expect(
    impact.documents.find((entry) => entry.code === 'added-after-backup')
      ?.action,
  ).toBe('delete');
  expect(
    impact.documents.find((entry) => entry.code === 'employee-handbook')
      ?.action,
  ).toBe('restore');

  const result = await documents.restoreBackup({
    actorId: 'admin',
    backupId: backup.id,
  });
  expect(result.backupId).toBe(backup.id);

  const all = await database
    .connection()
    .repository<DocumentRecord>('documents')
    .findMany();
  expect(all.map((document) => document.code)).not.toContain(
    'added-after-backup',
  );
  const reverted = all.find(
    (document) => document.code === 'travel-reimbursement',
  );
  expect(reverted?.summary).toBe(travel.summary);
  const broughtBack = all.find(
    (document) => document.code === 'employee-handbook',
  );
  expect(broughtBack?.deletedAt).toBeNull();

  const versions = await database
    .connection()
    .repository('documentVersions')
    .findMany();
  expect(versions.length).toBeGreaterThanOrEqual(1);
});

test('restoring is refused without a matching department set', async ({
  database,
}) => {
  const documents = service(database);
  const finance = await departmentByCode(database, 'finance');
  await expect(
    documents.createDocument({
      actorId: 'admin',
      values: {
        title: '没有部门的受限制度',
        category: 'policy',
        content: '内容。',
        visibility: 'departments',
        departmentIds: [],
      },
    }),
  ).rejects.toMatchObject<Partial<DocumentCenterError>>({
    code: 'DOCUMENT_DEPARTMENTS_REQUIRED',
  });

  const created = await documents.createDocument({
    actorId: 'admin',
    values: {
      title: '财务部制度',
      category: 'policy',
      content: '内容。',
      visibility: 'departments',
      departmentIds: [finance.id],
    },
  });
  expect(created.departmentIds).toEqual([finance.id]);
});
