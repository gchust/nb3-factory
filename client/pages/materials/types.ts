/** One material as `/api/materials` returns it. Only `title` and `body` are ever maintained by hand. */
export interface Material {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly restricted: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The two content fields a page writes. Visibility stays a permission decision. */
export interface MaterialContent {
  readonly title: string;
  readonly body: string;
}

export interface MaterialsListResponse {
  readonly data: readonly Material[];
  readonly meta: { readonly total: number };
}

export interface MaterialResponse {
  readonly data: Material;
}

/** What the list passes to its child routes so a saved dialog can refresh it. */
export interface MaterialsOutletContext {
  readonly reload: () => void;
}
