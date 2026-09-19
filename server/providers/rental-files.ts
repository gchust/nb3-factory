/**
 * Shared constants and shapes for the rental file attachments.
 *
 * Kept apart from the domain service so both the business routes and the file
 * storage routes can import the same access path, resource name and limits
 * without importing each other.
 */

/** Collection that stores file metadata through the File Repository. */
export const RENTAL_FILE_COLLECTION = 'rentalFiles';

/** Client resource name exposed by the File Repository route helper. */
export const RENTAL_FILE_RESOURCE = 'rentalFiles';

/** Disk every rental file is written to. */
export const RENTAL_FILE_DISK = 'local';

/** Public content path served by the guarded root route. */
export const RENTAL_FILE_ACCESS_PATH = '/uploads/rental-files';

/** A single selection may carry at most this many files. */
export const MAX_FILES_PER_UPLOAD = 5;

/** One stored file may not exceed 5 MB. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Attachment slots a booking owns, each rendered as its own group. */
export const BOOKING_ATTACHMENT_KINDS = [
  'agreement',
  'supplement',
  'deliveryPhoto',
  'deliveryPdf',
  'returnPhoto',
  'returnPdf',
] as const;
export type BookingAttachmentKind = (typeof BOOKING_ATTACHMENT_KINDS)[number];

/** Attachment slots a venue owns. `cover` holds exactly one file. */
export const VENUE_ATTACHMENT_KINDS = ['cover', 'gallery'] as const;
export type VenueAttachmentKind = (typeof VENUE_ATTACHMENT_KINDS)[number];

export type AttachmentKind = BookingAttachmentKind | VenueAttachmentKind;

export interface AttachmentRecord {
  /** Link-table id, used to remove the attachment. */
  readonly id: number;
  readonly kind: AttachmentKind;
  /** File metadata id, used as the `FileRecord.id` on the client. */
  readonly fileId: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly sort: number;
  readonly createdAt: string;
}

export interface AttachmentFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

export function isBookingAttachmentKind(
  value: string,
): value is BookingAttachmentKind {
  return (BOOKING_ATTACHMENT_KINDS as readonly string[]).includes(value);
}

export function isVenueAttachmentKind(
  value: string,
): value is VenueAttachmentKind {
  return (VENUE_ATTACHMENT_KINDS as readonly string[]).includes(value);
}

/** The content URL for a stored file, prefixed with the deployment base path. */
export function rentalFileContentUrl(
  publicBasePath: string,
  file: Pick<AttachmentFile, 'id' | 'ext'>,
): string {
  const base = (publicBasePath ?? '').replace(/\/$/, '');
  const name = `${encodeURIComponent(file.id)}${file.ext ? `.${encodeURIComponent(file.ext)}` : ''}`;
  return `${base}${RENTAL_FILE_ACCESS_PATH}/${name}`;
}
