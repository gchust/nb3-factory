/**
 * The document library's domain types.
 *
 * A value declaration only: it imports no running application, so a seed, a
 * migration test and the running server all read the same shapes. HTTP status
 * codes and request parsing live in the routes; these are what the service
 * speaks.
 */

/** The `documents` row as the service reads and writes it. */
export interface LibraryDocumentRecord {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** A document with the display data and the caller's rights the pages need. */
export interface LibraryDocumentView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Whether the caller may edit this document, resolved from the real policy. */
  readonly editable: boolean;
  /**
   * Whether the caller may hand this document to a colleague temporarily, which
   * is the `authorization.sharing-rules` settings permission. The share panel is
   * drawn from this, so a reader is never offered an action it cannot take.
   */
  readonly canShare: boolean;
}

export interface LibraryDocumentList {
  readonly items: readonly LibraryDocumentView[];
  readonly total: number;
  readonly canCreate: boolean;
}

/** What a list request may narrow the documents by. */
export interface LibraryDocumentQuery {
  /** Matches the title or the body, case-insensitively. */
  readonly q?: string;
  /** Narrows the list to one kind of visibility; omitted means every kind. */
  readonly visibility?: LibraryDocumentVisibility;
}

/** The visibility a list may be narrowed to. */
export type LibraryDocumentVisibility = 'published' | 'draft' | 'confidential';

export interface LibraryDocumentInput {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

/** A partial update; a field the caller omits keeps its stored value. */
export interface LibraryDocumentPatch {
  readonly title?: string;
  readonly body?: string;
  readonly published?: boolean;
  readonly confidential?: boolean;
}
