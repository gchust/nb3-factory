import type { FileRecord } from '@/extensions/nocobase-file-component-ui';

/**
 * A file attached to a material. `contentUrl` and the numeric `size` are what
 * the API returns; `@nocobase/app-plugin-file` returns the size of a BIGINT
 * column as an exact string, which the server normalizes before sending.
 */
export interface MaterialFile extends FileRecord {
  readonly contentUrl: string;
  readonly size: number;
}

export interface Material {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly MaterialFile[];
}

/** The body of `GET /api/projectMaterials`. */
export interface MaterialList {
  readonly data: Material[];
  readonly meta: {
    readonly total: number;
  };
}

/** The value used to create a material. */
export interface MaterialCreateInput {
  readonly title: string;
  readonly fileIds: string[];
}

/**
 * What a material update may change. Both fields are optional and a field left
 * out is left alone; `fileIds` carries the whole desired set, so a file missing
 * from it is detached.
 */
export interface MaterialUpdateInput {
  readonly title?: string;
  readonly fileIds?: string[];
}

/** What the list page hands to its child routes through `<Outlet context>`. */
export interface MaterialsOutletContext {
  readonly reload: () => void;
}

/** What the detail page hands to its edit child route through `<Outlet context>`. */
export interface MaterialDetailOutletContext {
  /** The record the detail page currently shows, used to start the edit form. */
  readonly material: Material;
  readonly onSaved: (material: Material) => void;
  readonly onNotFound: () => void;
}
