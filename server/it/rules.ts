/**
 * IT repair ticket business rules, kept free of HTTP, database and framework
 * imports so they can be unit tested directly and reused by the route layer.
 */

export const IT_CATEGORIES = ['computer', 'account', 'other'] as const;
export type ItCategory = (typeof IT_CATEGORIES)[number];

export const IT_STATUSES = ['pending', 'processing', 'completed'] as const;
export type ItStatus = (typeof IT_STATUSES)[number];

export const IT_TRANSITIONS = ['start', 'complete'] as const;
export type ItTransition = (typeof IT_TRANSITIONS)[number];

export const IT_TITLE_MAX_LENGTH = 200;
export const IT_DESCRIPTION_MAX_LENGTH = 2000;
export const IT_RESOLUTION_MAX_LENGTH = 2000;

export interface ItTicketDraft {
  title: string;
  category: ItCategory;
  description: string;
}

export type ItTicketValidation =
  { ok: true; value: ItTicketDraft } | { ok: false; reason: ItTicketReason };

export type ItTicketReason =
  | 'TITLE_REQUIRED'
  | 'TITLE_TOO_LONG'
  | 'CATEGORY_REQUIRED'
  | 'CATEGORY_INVALID'
  | 'DESCRIPTION_TOO_LONG'
  | 'RESOLUTION_REQUIRED'
  | 'RESOLUTION_TOO_LONG';

function isCategory(value: unknown): value is ItCategory {
  return (
    typeof value === 'string' &&
    (IT_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Validates and trims a submission. Only the fields an employee owns are read;
 * `submitterId` and `status` are server-assigned and never accepted from a
 * client.
 */
export function validateTicketDraft(input: {
  title?: unknown;
  category?: unknown;
  description?: unknown;
}): ItTicketValidation {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return { ok: false, reason: 'TITLE_REQUIRED' };
  if (title.length > IT_TITLE_MAX_LENGTH)
    return { ok: false, reason: 'TITLE_TOO_LONG' };

  if (input.category === undefined || input.category === null)
    return { ok: false, reason: 'CATEGORY_REQUIRED' };
  if (!isCategory(input.category))
    return { ok: false, reason: 'CATEGORY_INVALID' };

  const description =
    typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > IT_DESCRIPTION_MAX_LENGTH)
    return { ok: false, reason: 'DESCRIPTION_TOO_LONG' };

  return {
    ok: true,
    value: { title, category: input.category, description },
  };
}

export function isItTransition(value: unknown): value is ItTransition {
  return (
    typeof value === 'string' &&
    (IT_TRANSITIONS as readonly string[]).includes(value)
  );
}

/**
 * Whether a ticket in `status` may perform `transition`. A completed ticket is
 * terminal: neither transition is allowed, so it can never be modified or
 * completed twice.
 */
export function canTransition(
  status: string | undefined,
  transition: ItTransition,
): boolean {
  if (status === 'pending') return transition === 'start';
  if (status === 'processing') return transition === 'complete';
  return false;
}

/**
 * Validates the resolution supplied with a `complete` transition. Returns the
 * trimmed note or a reason the transition must be refused.
 */
export function validateResolution(
  input: unknown,
): { ok: true; value: string } | { ok: false; reason: ItTicketReason } {
  const resolution = typeof input === 'string' ? input.trim() : '';
  if (!resolution) return { ok: false, reason: 'RESOLUTION_REQUIRED' };
  if (resolution.length > IT_RESOLUTION_MAX_LENGTH)
    return { ok: false, reason: 'RESOLUTION_TOO_LONG' };
  return { ok: true, value: resolution };
}

/** A ticket is terminal once completed; the UI uses this to hide controls. */
export function isTerminalStatus(status: string): boolean {
  return status === 'completed';
}
