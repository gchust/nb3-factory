export interface LibraryDocument {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  ownerName: string;
  published: boolean;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface LibraryShare {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
}

export interface LibraryAdminDocument extends LibraryDocument {
  shares: LibraryShare[];
}

export interface LibraryAdminUser {
  id: string;
  name: string;
  email: string;
}

export interface LibraryListResponse<T> {
  data: T[];
  meta: { total: number };
}

export interface LibraryDocumentInput {
  title: string;
  body: string;
  published: boolean;
  confidential: boolean;
}
