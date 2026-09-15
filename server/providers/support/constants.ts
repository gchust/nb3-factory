/**
 * Shared identifiers for the support ticket module.
 *
 * The authorization resource ids use the `main.` connection prefix because the
 * application's authorization instance registers database collections on the
 * default connection.
 */
export const SUPPORT_TICKET_COLLECTION = 'main.support_tickets';
export const SUPPORT_ATTACHMENT_COLLECTION = 'main.support_attachments';

/** The page resources an authenticated user needs in order to open a page. */
export const SUPPORT_PAGE_IDS = [
  'home',
  'tickets',
  'ticket-detail',
  'stats',
] as const;

export const SUPPORT_AGENT_ROLE = 'support-agent';
export const SUPPORT_CUSTOMER_ROLE = 'support-customer';
export const SYSTEM_ADMINISTRATOR_ROLE = 'system-administrator';

/** Non-database authorization resources owned by this module. */
export const SUPPORT_STAFF_RESOURCE = 'support.role';
export const SUPPORT_STAFF_ACTION = 'staff';
export const SUPPORT_REPORT_RESOURCE = 'support.report';
export const SUPPORT_REPORT_ACTION = 'read';

export const TICKET_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = [
  'new',
  'in_progress',
  'pending_customer',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const UPLOADER_ROLES = ['customer', 'agent'] as const;
export type UploaderRole = (typeof UPLOADER_ROLES)[number];

export const DEFAULT_TICKET_PRIORITY: TicketPriority = 'medium';
export const DEFAULT_TICKET_STATUS: TicketStatus = 'new';

/** Largest single attachment the application accepts, in bytes. */
export const MAX_ATTACHMENT_BYTES: number = 10 * 1024 * 1024;

/** Body limit for the upload request, allowing for multipart overhead. */
export const ATTACHMENT_REQUEST_LIMIT_BYTES: number =
  MAX_ATTACHMENT_BYTES + 2 * 1024 * 1024;

/**
 * Extensions the support desk accepts: screenshots, logs, documents and a
 * single archive format. Executables and scripts are deliberately absent.
 */
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

export const ATTACHMENT_ACCESS_PATH = '/uploads/support';
export const ATTACHMENT_DISK = 'local';
