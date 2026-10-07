/**
 * The demonstration accounts and records the document library ships with.
 *
 * A seed creates them once, keyed by a stable id and business key, so an
 * upgrade, a restart or a re-run never duplicates them and never overwrites an
 * account or a document an administrator edited. This module is a value
 * declaration only: it imports no running application, so a seed, a migration
 * test and the provider's `boot()` all read the same constants.
 */

export interface LibraryAccountSeed {
  /** A fixed id, so a seeded document can name its owner and a rerun recognizes the row. */
  readonly id: string;
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

/** 甲: maintains their own documents (the document manager). */
export const MAINTAINER_ACCOUNT: LibraryAccountSeed = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  username: 'jia',
  name: '资料员甲',
  email: 'jia@example.com',
  password: 'Jia12345678',
};

/** 乙: reads published, non-confidential documents only (the reader). */
export const READER_ACCOUNT: LibraryAccountSeed = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  username: 'yi.reader',
  name: '阅读者乙',
  email: 'yi@example.com',
  password: 'Yi12345678',
};

/** Both accounts, in the order a seed creates them. */
export const LIBRARY_ACCOUNTS: readonly LibraryAccountSeed[] = [
  MAINTAINER_ACCOUNT,
  READER_ACCOUNT,
];

export interface LibraryDocumentSeed {
  /** A fixed uuid, so a re-run recognizes the row it already created. */
  readonly id: string;
  /** Also a stable business key: provisioning never inserts the same title twice. */
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

/** P: published, not confidential — every qualified colleague may read it. */
export const PUBLIC_DOCUMENT: LibraryDocumentSeed = {
  id: '11111111-1111-4111-8111-111111111111',
  title: '员工手册（公开）',
  body: '本手册面向全体同事，说明考勤、报销与休假等日常制度。',
  published: true,
  confidential: false,
};

/** D: the manager's own draft — visible only to its owner until published. */
export const DRAFT_DOCUMENT: LibraryDocumentSeed = {
  id: '22222222-2222-4222-8222-222222222222',
  title: '2026 年度计划（草稿）',
  body: '这里尚未定稿，仅资料员本人可见，发布前不对其他同事展示。',
  published: false,
  confidential: false,
};

/** C: published but confidential — never visible to an ordinary reader. */
export const CONFIDENTIAL_DOCUMENT: LibraryDocumentSeed = {
  id: '33333333-3333-4333-8333-333333333333',
  title: '高管薪酬方案（保密）',
  body: '保密内容：仅授权人员可查看，任何情况下都不对普通读者开放。',
  published: true,
  confidential: true,
};

/** Inserted in this order: P, then D, then C, all owned by 甲. */
export const LIBRARY_DOCUMENTS: readonly LibraryDocumentSeed[] = [
  PUBLIC_DOCUMENT,
  DRAFT_DOCUMENT,
  CONFIDENTIAL_DOCUMENT,
];
