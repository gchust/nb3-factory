/** What the signed-in user may do with one document, decided by the server so the UI never guesses. */
export interface DocumentCapabilities {
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canManageShares: boolean;
}

export interface LibraryDocument {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly capabilities: DocumentCapabilities;
}

export interface DocumentList {
  readonly data: readonly LibraryDocument[];
  readonly meta: {
    readonly total: number;
    readonly canCreate: boolean;
  };
}

export interface DocumentShare {
  readonly documentId: string;
  readonly userId: string;
  readonly userName: string | null;
  readonly createdAt: string;
}

export interface DocumentShareList {
  readonly data: readonly DocumentShare[];
  readonly meta: {
    readonly total: number;
    readonly canCreate: boolean;
  };
}

export interface DocumentChanges {
  readonly title?: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}
