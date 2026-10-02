/** Ticket categories and statuses shared by the list, the create form and the detail page. */
export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** A ticket as the API returns it, with submitter and handler names resolved. */
export interface Ticket {
  readonly id: number;
  readonly title: string;
  readonly category: TicketCategory;
  readonly description: string | null;
  readonly status: TicketStatus;
  readonly resolution: string | null;
  readonly submitterId: string;
  readonly submitterName: string;
  readonly handlerId: string | null;
  readonly handlerName: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** True when the signed-in person may start or complete tickets. */
  readonly canHandle: boolean;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly category: TicketCategory;
  readonly description?: string;
}

export const STATUS_BADGE: Record<
  TicketStatus,
  'default' | 'secondary' | 'outline'
> = {
  pending: 'outline',
  in_progress: 'secondary',
  completed: 'default',
};
