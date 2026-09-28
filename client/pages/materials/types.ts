import type { FileRecord } from '@nocobase/app-plugin-file/client';

/**
 * One attachment as the materials API returns it. It carries exactly the file
 * plugin's columns, so the file components can render it without a translation
 * step, plus the `contentUrl` the server computed for the private content route.
 */
export type MaterialFile = FileRecord;

export interface Material {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly MaterialFile[];
}

/** The writable part of a material: the title, and which uploaded files it owns. */
export interface MaterialChanges {
  readonly title?: string;
  readonly fileIds?: readonly string[];
}
