/** The document fields the library page reads from `GET /api/library/documents`. */
export interface LibraryDocument {
  readonly id: number;
  readonly title: string;
  readonly content: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
}

export interface LibraryDocumentList {
  readonly items: LibraryDocument[];
  readonly canRead: boolean;
  readonly canCreate: boolean;
  readonly canShare: boolean;
}

/** What the create and edit dialogs send; absent fields are left unchanged. */
export interface LibraryDocumentInput {
  readonly title?: string;
  readonly content?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

/** One temporary opening of a document, managed by an administrator. */
export interface LibraryShare {
  readonly key: string;
  readonly documentId: number;
  readonly documentTitle: string | null;
  readonly recipientId: string;
  readonly recipientName: string | null;
  readonly createdAt: string | null;
}

/** An account an administrator can open a document to. */
export interface LibraryRecipient {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
}
