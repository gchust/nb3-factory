/** Stored and returned shapes for the internal document library. */
export interface DocumentRecord {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  ownerName: string;
  published: boolean;
  confidential: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface DocumentShareRecord {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  sharedById: string;
  sharedByName: string;
  expiresAt: Date | string | null;
  revokedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface DocumentView {
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

export interface DocumentShareView {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  sharedById: string;
  sharedByName: string;
  expiresAt: string | null;
  revokedAt: string | null;
  active: boolean;
}

export interface ShareCandidate {
  id: string;
  name: string;
  username: string | null;
  email: string;
}

export interface DocumentInput {
  title: string;
  body: string;
  published: boolean;
  confidential: boolean;
}
