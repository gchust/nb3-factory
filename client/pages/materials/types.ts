import type { FileRecord } from '../../extensions/nocobase-file-component-ui/index.js';

/**
 * A project material and the attachments linked to it, exactly as the materials API presents them.
 *
 * `attachments` is a list of File Repository records, so the File component library's preview, download and
 * thumbnail pieces can read them without a second mapping. Every record carries the application-owned
 * `contentUrl`; the File plugin's public byte route is deliberately not mounted, so that URL is the only way
 * to the bytes and it is authenticated.
 */
export interface Material {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly FileRecord[];
}

/** What the form sends: the required title together with the ids of the already-uploaded attachments to link. */
export interface MaterialInput {
  readonly title: string;
  readonly attachmentIds: readonly string[];
}
