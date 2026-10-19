export const IT_TICKET_STATUSES = [
  'pending',
  'in_progress',
  'resolved',
  'closed',
] as const;
export type ItTicketStatus = (typeof IT_TICKET_STATUSES)[number];

export const IT_TICKET_URGENCIES = [
  'low',
  'medium',
  'high',
  'critical',
] as const;
export type ItTicketUrgency = (typeof IT_TICKET_URGENCIES)[number];

export const IT_TICKET_ACTIVITY_TYPES = [
  'created',
  'assigned',
  'progress',
  'resolved',
  'returned',
  'closed',
  'comment',
] as const;
export type ItTicketActivityType = (typeof IT_TICKET_ACTIVITY_TYPES)[number];

export const OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000;

export function ticketNumber(id: number | string): string {
  return `IT-${String(id).padStart(4, '0')}`;
}

export function isOpenTicket(status: string): boolean {
  return status === 'pending' || status === 'in_progress';
}

/** The only states each operation may start from. */
export const TICKET_TRANSITIONS = {
  assign: ['pending', 'in_progress'],
  progress: ['in_progress'],
  resolve: ['in_progress'],
  close: ['resolved'],
  return: ['resolved'],
} as const satisfies Readonly<Record<string, readonly ItTicketStatus[]>>;

export function canTransition(
  operation: keyof typeof TICKET_TRANSITIONS,
  status: string,
): boolean {
  return (TICKET_TRANSITIONS[operation] as readonly string[]).includes(status);
}
