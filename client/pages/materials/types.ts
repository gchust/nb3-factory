/** What a material record looks like through the API. */
export interface Material {
  readonly id: number;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The actions the current identity may perform on the list's records, decided by the server. */
export interface MaterialsCapabilities {
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly canDelete: boolean;
  readonly canShare: boolean;
}

export interface MaterialListResponse {
  readonly data: Material[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly capabilities: MaterialsCapabilities;
  };
}

/** A person a material is temporarily open to. */
export interface MaterialShare {
  readonly userId: string;
  readonly name: string | null;
  readonly createdAt: string;
}

export interface MaterialSharesResponse {
  readonly data: MaterialShare[];
  readonly meta: { readonly total: number };
}

/**
 * What the list passes to the child routes it opens: the capabilities the server reported for the collection, and the
 * refresh functions the create dialog, the detail drawer and a row's edit dialog use.
 */
export interface MaterialsOutletContext {
  readonly capabilities: MaterialsCapabilities | undefined;
  readonly reload: () => void;
  readonly afterDelete: () => void;
}

/** What the view behind the edit dialog passes it: the detail drawer, or the list for a row's menu. */
export interface MaterialEditOutletContext {
  readonly onSaved: (material: Material) => void;
  readonly onNotFound: () => void;
}
