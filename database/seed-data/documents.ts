/**
 * The three fictional documents the library demonstration ships with, and the
 * one deliberate mistake that proves confidentiality is decided by the record
 * rather than by sharing.
 *
 * P is published and not confidential: every reader sees it.
 * D is an unpublished draft: only its owner sees it until an administrator
 * temporarily opens this one document.
 * C is published but confidential: no reader sees it, and the seed shares it
 * with the reader on purpose so the confidentiality rule, not the absence of a
 * share, is what keeps it hidden.
 */

export interface LibraryDocumentFixture {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
  /** Whether the demonstration shares the document with the reader account. */
  readonly shareWithReader: boolean;
}

export const PUBLIC_DOCUMENT_ID = 'library-doc-public';
export const DRAFT_DOCUMENT_ID = 'library-doc-draft';
export const CONFIDENTIAL_DOCUMENT_ID = 'library-doc-confidential';

export const LIBRARY_DOCUMENTS: readonly LibraryDocumentFixture[] = [
  {
    id: PUBLIC_DOCUMENT_ID,
    title: '公开资料 P',
    body: '这是一份已发布且不保密的资料，所有具备资料阅读资格的同事都可以查看。',
    published: true,
    confidential: false,
    shareWithReader: false,
  },
  {
    id: DRAFT_DOCUMENT_ID,
    title: '私有草稿 D',
    body: '这是一份尚未发布的草稿，默认只有负责人可以查看；管理员可以临时向某位同事开放这一份。',
    published: false,
    confidential: false,
    shareWithReader: false,
  },
  {
    id: CONFIDENTIAL_DOCUMENT_ID,
    title: '保密资料 C',
    body: '这是一份保密资料。即使它已经发布、甚至被误加了共享，阅读者也不能查看。',
    published: true,
    confidential: true,
    // The point of this row is that the share exists and still does not open
    // the document to the reader.
    shareWithReader: true,
  },
];
