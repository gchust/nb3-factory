import type { FileRecord } from '@/extensions/nocobase-file-component-ui';

/**
 * What the materials list hands to its child routes through `<Outlet context>`:
 * a way to reload the list after a create, an edit made over the drawer, or a
 * delete. A child route cannot ask the list to refetch any other way, because
 * the list stays mounted while an overlay is open.
 */
export interface MaterialsOutletContext {
  readonly reload: () => void;
}

/**
 * What the material drawer hands to its `edit` child route: the drawer's own
 * reload, so the panel behind the dialog updates on save, and the list's, so
 * the list reflects the change once the drawer closes.
 */
export interface MaterialDetailOutletContext {
  readonly reloadMaterial: () => void;
  readonly reloadList: () => void;
}

/** One material and the attachments that belong to it, as `/api/projectMaterials` returns them. */
export interface Material {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly FileRecord[];
}

/** The `{ data, meta }` envelope of `GET /api/projectMaterials`. */
export interface MaterialList {
  readonly data: readonly Material[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/** How many materials one list request asks for; the endpoint accepts at most 100. */
export const MATERIALS_PAGE_SIZE = 20;

/** The most attachments one material may carry; the endpoint refuses more. */
export const MATERIAL_FILES_MAX = 50;

/** The per-file limit, matching the upload route's `maxSize`. */
export const MATERIAL_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** The picker filter for the file types a material accepts: images and Word documents. */
export const MATERIAL_FILE_ACCEPT: readonly string[] = ['image/*', '.docx'];
