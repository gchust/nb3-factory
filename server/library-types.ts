/**
 * The document library's own vocabulary: the two tables it owns, the field
 * lists its permissions expose, and the namespace its persisted titles resolve
 * in.
 *
 * A `type` alias rather than an `interface` on purpose: the Repository treats a
 * row as `Record<string, ...>`, and an interface has no implicit index
 * signature while an object type alias does.
 */

/** A row of `documents`, the records the library is about. */
export type LibraryDocument = {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  /** The maintainer who owns the record; the only account that may edit it. */
  readonly ownerId: string;
  /** Published, non-confidential records are readable by every reader. */
  readonly published: boolean;
  /** Confidential records are readable by their owner and root only. */
  readonly confidential: boolean;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
};

/**
 * A document as the routes present it to the UI: the stored row plus its
 * owner's display name, which the service resolves after the policy has
 * already decided the record is visible.
 */
export type LibraryDocumentView = LibraryDocument & {
  readonly ownerName: string | null;
};

/** The columns the service reads to name a document's owner. */
export type LibraryUserRow = {
  readonly id: string;
  readonly name: string;
};

/** The values a create accepts from the route; ids and times are set server-side. */
export type LibraryDocumentCreate = {
  readonly id: string;
  readonly title: string;
  readonly body?: string | null;
  readonly ownerId: string;
  readonly published?: boolean;
  readonly confidential?: boolean;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
};

/** The values an edit accepts. `ownerId` and `id` are deliberately absent. */
export type LibraryDocumentUpdate = {
  readonly title?: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
  readonly updatedAt?: Date | string;
};

/** A row of `documentShares`: a temporary grant of one document to one account. */
export type LibraryDocumentShare = {
  readonly id: string;
  readonly documentId: string;
  readonly userId: string;
  readonly createdAt: Date | string;
};

/** Every readable column of a document. */
export const documentFields = '*' as const;

/** What a create may write. The route fills the id, owner and timestamps itself. */
export const documentCreateFields = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof LibraryDocument)[];

/**
 * What an edit may write. `id`, `ownerId` and `createdAt` are absent, so no
 * edit path can hand a document to another account or rewrite its history.
 */
export const documentUpdateFields = [
  'title',
  'body',
  'published',
  'confidential',
  'updatedAt',
] as const satisfies readonly (keyof LibraryDocument)[];

/** Every readable column of a share. */
export const shareFields = '*' as const;

/** What a share create may write. The route fills the id and creation time. */
export const shareCreateFields = [
  'id',
  'documentId',
  'userId',
  'createdAt',
] as const satisfies readonly (keyof LibraryDocumentShare)[];

/** The i18n namespace this application's persisted authorization titles use. */
export const APP_NAMESPACE = 'nb3-factory';
