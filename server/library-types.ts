/** One row of the document library table, as the database returns it. */
export interface LibraryDocumentRow {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** What the API returns for a document. `ownerName` is resolved from the user table for display. */
export interface LibraryDocumentView {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  ownerName: string;
  published: boolean;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryDocumentShare {
  userId: string;
  name: string;
  email: string;
}

export interface LibraryDocumentList {
  items: readonly LibraryDocumentView[];
  total: number;
}
