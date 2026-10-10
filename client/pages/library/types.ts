/** One document as the library API returns it. */
export interface LibraryDocument {
  readonly id: string;
  readonly title: string;
  readonly content: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The list response of `GET /api/library/documents`. */
export interface LibraryDocumentList {
  readonly data: LibraryDocument[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/** The fields a form submits when creating or editing a document. */
export interface LibraryDocumentInput {
  readonly title: string;
  readonly content: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
}

/**
 * What the list page provides to its child routes (create, the row's edit
 * dialog and the detail drawer). The drawer provides its own nested edit
 * dialog with {@link LibraryEditOutletContext}.
 */
export interface LibraryListOutletContext {
  readonly reload: () => void;
  readonly afterDelete: () => void;
  readonly onSaved: () => void;
  readonly onNotFound: () => void;
}

/** What an edit dialog reads from the view it is stacked on. */
export interface LibraryEditOutletContext {
  readonly onSaved: () => void;
  readonly onNotFound: () => void;
}
