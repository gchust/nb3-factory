export interface DocumentItem {
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

export interface DocumentShare {
  readonly id: string;
  readonly documentId: string;
  readonly userId: string;
  readonly userName: string;
  readonly sharedById: string;
  readonly sharedByName: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly active: boolean;
}

export interface ShareCandidate {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
}

export interface DocumentListResponse {
  readonly data: DocumentItem[];
  readonly meta: { readonly total: number };
}

export interface DocumentDataResponse {
  readonly data: DocumentItem;
}

export interface DocumentShareListResponse {
  readonly data: DocumentShare[];
  readonly meta: { readonly total: number };
}

export interface DocumentShareDataResponse {
  readonly data: DocumentShare;
}

export interface ShareCandidateListResponse {
  readonly data: ShareCandidate[];
  readonly meta: { readonly total: number };
}

export interface DocumentInput {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

export interface DocumentsContext {
  readonly reload: () => void;
}
