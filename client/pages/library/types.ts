export interface LibraryDocument {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LibraryPerson {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
}

export interface LibraryListMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface LibraryDocumentList {
  readonly documents: readonly LibraryDocument[];
  readonly meta: LibraryListMeta;
}

export interface LibraryDocumentInput {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}
