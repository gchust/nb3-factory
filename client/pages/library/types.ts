/**
 * One document as `/api/library/documents` presents it.
 *
 * `canEdit` and `canDelete` are computed by the server for the caller and the
 * record, so the browser never offers a control the server would refuse.
 */
export interface LibraryDocument {
  id: string;
  title: string;
  body: string | null;
  ownerId: string;
  ownerName: string | null;
  published: boolean;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

/** The list endpoint's response body. `canCreate` gates the page's "New" action. */
export interface LibraryDocumentList {
  data: LibraryDocument[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    canCreate: boolean;
  };
}

/** What the list passes through its `Outlet` to the create dialog and the detail drawer. */
export interface LibraryOutletContext {
  /** Reloads the list, keeping the rows on screen while it runs. */
  readonly reload: () => void;
  /** Called after a delete, so the list can refresh and move focus to a stable place. */
  readonly afterDelete: () => void;
}

/**
 * What the list and the detail drawer pass to the edit dialog. The dialog
 * loads the record itself, so it only needs to report the outcome back.
 */
export interface LibraryEditOutletContext {
  readonly onSaved: (document: LibraryDocument) => void;
  readonly onNotFound: () => void;
}
