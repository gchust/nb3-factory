/** Shapes the internal document library API returns. The server owns them. */

export interface MaterialListItem {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  /** Whether the current user may edit this document. Reading never implies editing. */
  readonly canEdit: boolean;
  /** The document was opened to the current user by a temporary single-document share. */
  readonly shared: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MaterialShare {
  readonly userId: string;
  readonly userName: string;
  readonly createdAt: string;
}

export interface MaterialDetail extends MaterialListItem {
  readonly canShare: boolean;
  readonly shares: readonly MaterialShare[];
}

export interface MaterialListMeta {
  readonly total: number;
  readonly canCreate: boolean;
}

export interface MaterialListResult {
  readonly data: readonly MaterialListItem[];
  readonly meta: MaterialListMeta;
}

export interface MaterialInput {
  readonly title: string;
  readonly content: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

export interface ManagedUserOption {
  readonly id: string;
  readonly name: string;
  readonly username?: string;
  readonly email: string;
  readonly disabledAt: string | null;
}

export interface ManagedUserPage {
  readonly data: readonly ManagedUserOption[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}
