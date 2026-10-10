import { randomUUID } from 'node:crypto';

import type { RequestServiceContext } from './context.js';
import { invalid, notFound, unavailable } from './errors.js';
import {
  attachOrderFile,
  detachOrderFile,
  listOrderAttachments,
} from './orders.js';
import type { FileCategory, ServiceOrderFileRow } from './types.js';

/**
 * Order attachments on the private `local` disk.
 *
 * The bytes never travel through an unauthenticated route: the upload and the
 * download both resolve the caller's `service.orders` permission first and only
 * then touch storage, which is what makes a photo or a repair report as private
 * as the order it belongs to. The file name is generated, so a caller cannot
 * choose where on the disk the object lands.
 */

/** The largest attachment the application accepts, in bytes. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface AcceptedFormat {
  readonly mime: string;
  readonly category: FileCategory;
  /** The leading bytes every file of this format starts with. */
  readonly signature: readonly number[];
  /** How the format is named in a rejection message. */
  readonly format: string;
}

/**
 * The accepted formats, keyed by extension.
 *
 * Only what the business asked for is accepted: PNG inspection photos and DOCX
 * repair reports. Anything else is refused instead of being stored as an
 * unserviceable blob. The signature is what makes a `.png` that is not a PNG
 * fail loudly instead of being stored as a photo the viewer cannot open.
 */
const ACCEPTED: Readonly<Record<string, AcceptedFormat>> = {
  png: {
    mime: 'image/png',
    category: 'photo',
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    format: 'PNG image',
  },
  docx: {
    mime: DOCX_MIME,
    category: 'report',
    // A DOCX is a ZIP archive; a valid one begins with a local file header.
    signature: [0x50, 0x4b, 0x03, 0x04],
    format: 'DOCX document',
  },
};

/** `true` when `bytes` starts with the format's leading signature bytes. */
function hasSignature(
  bytes: Uint8Array,
  signature: readonly number[],
): boolean {
  if (bytes.byteLength < signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[index] === byte);
}

export interface AttachmentUpload {
  readonly filename: string;
  readonly mimeType?: string | null;
  readonly bytes: Uint8Array;
}

export interface AttachmentContent {
  readonly file: ServiceOrderFileRow;
  readonly bytes: Uint8Array;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function slugify(filename: string): string {
  const base = filename.slice(
    0,
    filename.lastIndexOf('.') > 0 ? filename.lastIndexOf('.') : undefined,
  );
  const slug = base
    .normalize('NFKD')
    .replaceAll(/[^\w.-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'attachment';
}

/**
 * Stores one uploaded attachment against an order.
 *
 * The type and the size are checked before anything is written, so a rejected
 * upload leaves no object behind. `category` comes from the accepted extension
 * rather than from the caller: a PNG is a photo and a DOCX is a report.
 */
export async function uploadOrderAttachment(
  context: RequestServiceContext,
  orderId: number,
  upload: AttachmentUpload,
): Promise<ServiceOrderFileRow> {
  const ext = extensionOf(upload.filename);
  const accepted = ACCEPTED[ext];
  if (!accepted) {
    throw invalid(
      'ATTACHMENT_TYPE_UNSUPPORTED',
      `Only PNG photos and DOCX reports can be attached; received "${ext || upload.filename}".`,
    );
  }
  if (upload.bytes.byteLength === 0) {
    throw invalid('ATTACHMENT_EMPTY', 'The uploaded file is empty.');
  }
  if (upload.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw invalid(
      'ATTACHMENT_TOO_LARGE',
      `The attachment is larger than ${MAX_ATTACHMENT_BYTES} bytes.`,
    );
  }
  if (!hasSignature(upload.bytes, accepted.signature)) {
    throw invalid(
      'ATTACHMENT_CORRUPTED',
      `The uploaded file is not a valid ${accepted.format}; its content does not match the ".${ext}" extension.`,
    );
  }
  const drive = context.drive;
  if (!drive) {
    throw unavailable(
      'ATTACHMENT_STORAGE_UNAVAILABLE',
      'No file storage is configured, so attachments cannot be stored.',
    );
  }

  const key = `service-orders/${orderId}/${randomUUID()}-${slugify(upload.filename)}.${ext}`;
  await drive.use('local').put(key, upload.bytes);

  const now = new Date().toISOString();
  const files = context.database.repository<ServiceOrderFileRow>(
    'service_order_files',
  );
  const created = await files.createOne({
    values: {
      // The collection's primary key is a `uuid`, whose column has no database
      // default: the caller supplies the identifier the same way the object key
      // above is generated.
      id: randomUUID(),
      disk: 'local',
      key,
      filename: upload.filename,
      ext,
      mimeType: accepted.mime,
      size: upload.bytes.byteLength,
      category: accepted.category,
      uploadedById: context.actorId,
      createdAt: now,
      updatedAt: now,
    } as never,
  });

  return attachOrderFile(context, orderId, {
    fileId: created.record.id,
    category: accepted.category,
  });
}

/**
 * Reads one attachment of an order after checking that the caller may see it.
 *
 * `listOrderAttachments` already resolves the order through the caller's data
 * scope, so a file of an order the caller cannot read is never returned.
 */
export async function readOrderAttachment(
  context: RequestServiceContext,
  orderId: number,
  fileId: string,
): Promise<AttachmentContent> {
  const files = await listOrderAttachments(context, orderId);
  const file = files.find((candidate) => candidate.id === fileId);
  if (!file) {
    throw notFound(
      'FILE_NOT_ON_ORDER',
      `Attachment ${fileId} is not attached to order ${orderId}.`,
    );
  }
  const drive = context.drive;
  if (!drive) {
    throw unavailable(
      'ATTACHMENT_STORAGE_UNAVAILABLE',
      'No file storage is configured, so attachments cannot be read.',
    );
  }
  const bytes = await drive.use(file.disk).getBytes(file.key);
  return { file, bytes };
}

/**
 * Removes an attachment from an order and from storage.
 *
 * The order link is dropped through `detachOrderFile`, which writes the audit
 * log entry; the object itself is deleted afterwards and a missing object is
 * not an error, so a repeated delete stays idempotent.
 */
export async function removeOrderAttachment(
  context: RequestServiceContext,
  orderId: number,
  fileId: string,
): Promise<ServiceOrderFileRow> {
  const detached = await detachOrderFile(context, orderId, fileId);
  const drive = context.drive;
  if (drive) {
    await drive.use(detached.disk).delete(detached.key);
  }
  await context.database
    .repository<ServiceOrderFileRow>('service_order_files')
    .deleteOne({ filter: { id: fileId } });
  return detached;
}
