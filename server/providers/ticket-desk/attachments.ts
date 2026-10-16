/**
 * Screenshot handling for the ticket desk.
 *
 * A browser sends an attachment as a `data:` URL of base64 bytes rather than as a multipart body: the API is JSON
 * everywhere else, and a screenshot is small enough that base64 costs nothing worth a second request shape. What the
 * browser *says* it is sending is not trusted — the first bytes of the decoded content must be the signature of the
 * media type it claimed, so a `.png` that is really an HTML page is refused instead of stored and served back.
 *
 * The bytes go to a drive disk under a random key; the row in `ticketAttachments` names the disk and the key, and the
 * only way to read them back is the ticket's own authenticated content route. A key is never exposed on its own.
 */
import { TicketRefusal } from './errors.js';

/** How many screenshots one ticket may carry. */
export const MAX_ATTACHMENTS = 5;

/** How large one screenshot may be, after base64 decoding. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** The only media types the desk accepts: a screenshot is an image. */
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type AllowedAttachmentType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

export interface DecodedAttachment {
  readonly filename: string;
  readonly mimeType: AllowedAttachmentType;
  readonly bytes: Uint8Array;
}

/** The shortest signature of each accepted type; enough to reject anything that is not the type it claims. */
function signatureMatches(
  bytes: Uint8Array,
  mimeType: AllowedAttachmentType,
): boolean {
  const starts = (...expected: number[]): boolean =>
    expected.every((byte, index) => bytes[index] === byte);

  switch (mimeType) {
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/jpeg':
      return starts(0xff, 0xd8, 0xff);
    case 'image/gif':
      return starts(0x47, 0x49, 0x46, 0x38);
    case 'image/webp':
      // "RIFF" .... "WEBP": the four-byte size sits between the two signatures.
      return (
        starts(0x52, 0x49, 0x46, 0x46) &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
  }
}

/** A browser sometimes reports `image/jpg`; the IANA name is `image/jpeg`. */
function normalizeMimeType(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  return lower;
}

function isAllowed(mimeType: string): mimeType is AllowedAttachmentType {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(mimeType);
}

const DATA_URL_PREFIX = /^data:([^;,]+)?((?:;[^,]*)*),/u;

/**
 * Decodes one `data:` URL into the bytes and the media type it really holds.
 *
 * Refuses anything that is not a base64 data URL, is not an accepted image type, exceeds the size limit, or whose
 * signature contradicts the type it declares. The message is a key the route translates.
 */
export function decodeAttachment(
  value: {
    readonly filename?: unknown;
    readonly contentType?: unknown;
    readonly dataBase64?: unknown;
  },
  index: number,
): DecodedAttachment {
  const field = `attachments[${index}]`;
  const filename =
    typeof value.filename === 'string' ? value.filename.trim() : '';
  if (!filename) {
    throw new TicketRefusal({
      kind: 'invalid',
      reason: 'ATTACHMENT_FILENAME_REQUIRED',
      messageKey: 'ticket.problem.attachmentFilenameRequired',
      problems: [
        {
          field: `${field}.filename`,
          messageKey: 'ticket.problem.attachmentFilenameRequired',
        },
      ],
    });
  }

  const declared = normalizeMimeType(
    typeof value.contentType === 'string' && value.contentType
      ? value.contentType
      : '',
  );
  if (!isAllowed(declared)) {
    throw new TicketRefusal({
      kind: 'invalid',
      reason: 'ATTACHMENT_TYPE_NOT_ALLOWED',
      messageKey: 'ticket.problem.attachmentTypeNotAllowed',
      problems: [
        {
          field: `${field}.contentType`,
          messageKey: 'ticket.problem.attachmentTypeNotAllowed',
        },
      ],
    });
  }

  const raw = typeof value.dataBase64 === 'string' ? value.dataBase64 : '';
  // Accept either the base64 payload alone or a complete `data:` URL, so a browser that sends `FileReader`'s result
  // unchanged needs no transformation first.
  const match = DATA_URL_PREFIX.exec(raw);
  const base64 = match ? raw.slice(match[0].length) : raw;
  if (!base64) {
    throw new TicketRefusal({
      kind: 'invalid',
      reason: 'ATTACHMENT_CONTENT_REQUIRED',
      messageKey: 'ticket.problem.attachmentContentRequired',
      problems: [
        {
          field: `${field}.dataBase64`,
          messageKey: 'ticket.problem.attachmentContentRequired',
        },
      ],
    });
  }

  // `Buffer` is the only base64 decoder that refuses malformed input instead of silently dropping it.
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength === 0) {
    throw new TicketRefusal({
      kind: 'invalid',
      reason: 'ATTACHMENT_CONTENT_REQUIRED',
      messageKey: 'ticket.problem.attachmentContentRequired',
      problems: [
        {
          field: `${field}.dataBase64`,
          messageKey: 'ticket.problem.attachmentContentRequired',
        },
      ],
    });
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new TicketRefusal({
      kind: 'invalid',
      reason: 'ATTACHMENT_TOO_LARGE',
      messageKey: 'ticket.problem.attachmentTooLarge',
      problems: [
        {
          field: `${field}.dataBase64`,
          messageKey: 'ticket.problem.attachmentTooLarge',
        },
      ],
    });
  }
  if (!signatureMatches(bytes, declared)) {
    throw new TicketRefusal({
      kind: 'invalid',
      reason: 'ATTACHMENT_CONTENT_MISMATCH',
      messageKey: 'ticket.problem.attachmentContentMismatch',
      problems: [
        {
          field: `${field}.dataBase64`,
          messageKey: 'ticket.problem.attachmentContentMismatch',
        },
      ],
    });
  }

  return { filename, mimeType: declared, bytes: new Uint8Array(bytes) };
}

/** Decodes a whole submission, refusing more than {@link MAX_ATTACHMENTS} files. */
export function decodeAttachments(value: unknown): DecodedAttachment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TicketRefusal({
      kind: 'invalid',
      reason: 'ATTACHMENTS_INVALID',
      messageKey: 'ticket.problem.attachmentsInvalid',
      problems: [
        {
          field: 'attachments',
          messageKey: 'ticket.problem.attachmentsInvalid',
        },
      ],
    });
  }
  if (value.length > MAX_ATTACHMENTS) {
    throw new TicketRefusal({
      kind: 'invalid',
      reason: 'TOO_MANY_ATTACHMENTS',
      messageKey: 'ticket.problem.tooManyAttachments',
      problems: [
        {
          field: 'attachments',
          messageKey: 'ticket.problem.tooManyAttachments',
        },
      ],
    });
  }
  return value.map((file, index) =>
    decodeAttachment((file ?? {}) as Record<string, unknown>, index),
  );
}

const EXTENSIONS: Record<AllowedAttachmentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * The disk key for one screenshot. The ticket's id puts every screenshot of a ticket in one directory, and the random
 * tail keeps the key unguessable, since the key is the only thing naming the bytes on the disk.
 */
export function attachmentKey(
  ticketId: number,
  mimeType: AllowedAttachmentType,
): string {
  return `ticket-desk/tickets/${ticketId}/${crypto.randomUUID()}.${EXTENSIONS[mimeType]}`;
}

/** The `Content-Disposition` value that shows an image inline but downloads a name the user recognizes. */
export function inlineContentDisposition(filename: string): string {
  // Only the ASCII name is quoted; anything else would have to be percent-encoded with `filename*`, and a screenshot
  // name carrying non-ASCII characters is rare enough not to deserve the extra header.
  const ascii = filename.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_');
  return `inline; filename="${ascii}"`;
}
