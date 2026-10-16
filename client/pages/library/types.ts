/**
 * The shapes the document library's HTTP API answers with
 * (`server/routes/library/schemas.ts`), as the pages consume them.
 *
 * `editable` is the server's decision, not the browser's: it is true only when
 * the requester's Permission Set grants the `edit` action over that record.
 * That is what makes "reading is not editing" hold — the reader receives
 * `editable: false` for a document it can read.
 */
export interface LibraryDocument {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly ownerId: string;
  /** The owner's display name; the server falls back to the id. */
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  /** Whether the requester may change this record. */
  readonly editable: boolean;
  /** Whether the requester may share it temporarily, i.e. manage Sharing Rules. */
  readonly canShare: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The visibility a list can be narrowed to. */
export type LibraryDocumentVisibility = 'published' | 'draft' | 'confidential';

export interface LibraryDocumentPage {
  readonly items: readonly LibraryDocument[];
  readonly total: number;
  /** Whether the requester may create a document at all. */
  readonly canCreate: boolean;
}

export interface LibraryDocumentInput {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

export type LibraryDocumentPatch = Partial<LibraryDocumentInput>;

/** One temporary share of specific documents with specific people. */
export interface LibraryShare {
  readonly key: string;
  readonly documentIds: readonly string[];
  readonly subjectIds: readonly string[];
  readonly reason: string | null;
}
