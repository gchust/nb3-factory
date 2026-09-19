import type { FileRecord } from '@/extensions/nocobase-file-component-ui';
import type { Attachment } from '@/lib/rentals';

/** A stored attachment presented as the File component UI's record shape. */
export interface AttachmentFile extends FileRecord {
  /** The link-table id, which is what removal operates on. */
  readonly attachmentId: number;
}

/**
 * Adapts the rental attachment payload to the File UI record shape. The file
 * metadata id becomes the record id so previews, thumbnails and keys are all
 * stable per stored file.
 */
export function toFileRecords(
  attachments: readonly Attachment[],
): readonly AttachmentFile[] {
  return attachments.map((attachment) => ({
    id: attachment.fileId,
    disk: 'local',
    key: '',
    filename: attachment.filename,
    ext: attachment.ext,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt,
    updatedAt: attachment.createdAt,
    contentUrl: attachment.contentUrl,
    attachmentId: attachment.id,
  }));
}

/** Reads the link-table id back off a record produced by {@link toFileRecords}. */
export function attachmentIdOf(file: FileRecord): number {
  return (file as AttachmentFile).attachmentId;
}
