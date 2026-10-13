/**
 * The shapes the library feature exchanges between its service and its routes.
 *
 * `DocumentView` is what a reader sees: the stored row plus the two things a client cannot decide for itself, the
 * owner's display name and whether the current person may edit this document.
 */

/** The stored row, as the database returns it. */
export interface DocumentRecord {
  /** Lets the row satisfy the database layer's `Row` contract. */
  [key: string]: unknown;
  id: string;
  title: string;
  body: string | null;
  published: boolean;
  confidential: boolean;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** A document as the API answers it. */
export interface DocumentView {
  id: string;
  title: string;
  body: string | null;
  published: boolean;
  confidential: boolean;
  ownerId: string;
  ownerName: string | null;
  /** Whether the current person owns the document and may therefore change it. */
  canEdit: boolean;
  /** Whether this document reached the current person through a temporary share rather than by ownership. */
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One person a document is temporarily shared with. */
export interface DocumentShareView {
  userId: string;
  name: string | null;
  username: string | null;
  email: string | null;
  createdAt: string;
}

/** The fields a person may set when creating or updating a document. */
export interface DocumentInput {
  title?: string;
  body?: string | null;
  published?: boolean;
  confidential?: boolean;
}

/** The identity a request is answered for. `unrestricted` is the root bypass. */
export interface DocumentRequester {
  userId: string;
  unrestricted: boolean;
}
