/**
 * The document library's client-side vocabulary, mirroring the shapes the
 * `/api/library` endpoints answer with.
 *
 * Times arrive as ISO strings over JSON, so they are typed as strings here
 * even though the server's repository deals in `Date` values.
 */

/** One document as the library endpoints return it. */
export type LibraryDocument = {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** The business fields a create or an edit form submits. */
export type LibraryDocumentInput = {
  readonly title: string;
  readonly body: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
};

/** A temporary grant of one document to one account. */
export type LibraryShare = {
  readonly id: string;
  readonly documentId: string;
  readonly userId: string;
  readonly createdAt: string;
};

/** An account a document may be shared with. */
export type LibraryAccount = {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
};
