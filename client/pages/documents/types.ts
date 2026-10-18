import type { DocumentItem } from '#lib/documents-client';

/** Rows per page in the document list. */
export const DOCUMENTS_PAGE_SIZE = 10;

export type DocumentSortField = 'title' | 'updatedAt';
export type DocumentSortOrder = 'asc' | 'desc';

/** The business capability the list and its endpoints share; `useCan` asks about the same pair the server checks. */
export const DOCUMENTS_RESOURCE = {
  type: 'composite',
  id: 'documents',
} as const;

/** The page grant that opens `/documents`; the route's `authz` names the same id. */
export const DOCUMENTS_PAGE_RESOURCE = {
  type: 'page',
  id: 'documents',
} as const;

/** The administration settings item the `/settings` page and its endpoints check. */
export const DOCUMENTS_ADMIN_RESOURCE = {
  type: 'settings',
  id: 'documents.admin',
} as const;

/**
 * The positive integer a `:documentId` route parameter names, or `undefined` when the URL carries no usable id.
 *
 * A page decides "not found" from this at render time instead of storing it: an id that never was valid is a fact
 * of the URL, not state that needs an effect to discover.
 */
export function parseDocumentId(value: string): number | undefined {
  const id = Number(value);
  return value !== '' && Number.isInteger(id) && id > 0 ? id : undefined;
}

/** What every page under `/documents` reads from its nearest parent route. */
export interface DocumentsListContext {
  /** Re-read the list after something behind the page changed. */
  readonly reload: () => void;
}

/** What a stacked edit dialog reads: what to do once it saved, and when the record is already gone. */
export interface DocumentEditContext {
  readonly onSaved: (document: DocumentItem) => void;
  readonly onNotFound: () => void;
}

/** The list page provides both; the detail drawer provides the edit part to the dialog stacked on it. */
export type DocumentsOutletContext = DocumentsListContext & DocumentEditContext;
