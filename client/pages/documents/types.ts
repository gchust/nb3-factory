/**
 * The composite resource an administrator grants for this feature. Spelled
 * here as a literal because a client bundle must not import server modules;
 * it is the same value `server/library/resources.ts` declares.
 */
export const DOCUMENTS_RESOURCE = 'library.documents';

/** One document as `GET /api/documents` returns it. */
export interface Document {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

/** The list response body. */
export interface DocumentList {
  readonly data: readonly Document[];
  readonly meta: { readonly total: number };
}

/** What the list page passes to the child routes it opens. */
export interface DocumentsOutletContext {
  readonly reload: () => void;
  /** After a delete, refresh the list and move focus somewhere stable. */
  readonly afterDelete: () => void;
}

/** What the detail drawer passes to the edit dialog stacked on it. */
export interface DocumentEditOutletContext {
  /** After a save, show the record the endpoint returned without waiting for a reload. */
  readonly onSaved: (document: Document) => void;
  /** The record the dialog was editing no longer exists. */
  readonly onNotFound: () => void;
}

/** What the detail drawer reads from the list page behind it. */
export interface DocumentDetailPageContext {
  readonly refresh: () => void;
}
