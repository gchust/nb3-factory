/**
 * Client-side mirror of the server's attachment rules.
 *
 * The server remains the authority — it is the only side that sees the real
 * bytes — but the browser validates first so a rejected file gets an immediate
 * message instead of a round trip. `tests/support-constants.test.ts` fails if
 * this list drifts from the server's.
 */
export const TICKET_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = [
  'new',
  'in_progress',
  'pending_customer',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const MAX_ATTACHMENT_BYTES: number = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'pdf',
  'txt',
  'log',
  'csv',
  'json',
  'md',
  'zip',
] as const;

/** The `accept` attribute of the upload control. */
export const ATTACHMENT_ACCEPT: string = ALLOWED_ATTACHMENT_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(',');
