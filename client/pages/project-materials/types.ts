import type { FileRecord } from '@nocobase/app-plugin-file/client';

/**
 * An attachment as the Project Materials API returns it. The columns up to
 * `updatedAt` are the ones the File plugin gives every uploaded file;
 * `materialId` is null while the upload is still a draft, and `contentUrl` is
 * added by the server so the browser can read the bytes through the private
 * content route.
 */
export interface ProjectMaterialAttachment extends FileRecord {
  readonly materialId: string | null;
}

export interface ProjectMaterial {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly ProjectMaterialAttachment[];
}

/** The create/update body: a title plus the ids of already-uploaded attachments. */
export interface ProjectMaterialInput {
  readonly title: string;
  readonly attachmentIds: readonly string[];
}

/** v1 accepts PNG photos and Word documents. */
export const ATTACHMENT_ACCEPT = ['.png', '.docx'] as const;

/** Mirrors the server's upload limit, so a large file fails in the field instead of after the request. */
export const ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024;

/** What the list page passes to the create and detail child routes through `<Outlet context>`. */
export interface ProjectMaterialsOutletContext {
  readonly reload: () => void;
}

/** What the detail drawer passes to its edit child route through `<Outlet context>`. */
export interface ProjectMaterialDetailOutletContext {
  readonly onSaved: (material: ProjectMaterial) => void;
  readonly onNotFound: () => void;
}
