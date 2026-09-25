/** Ticket vocabulary shared by the page components and the API helpers. */

export const TICKET_STATUSES = ['pending', 'in-progress', 'completed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export interface Ticket {
  readonly id: number;
  readonly title: string;
  readonly category: TicketCategory;
  readonly description: string | null;
  readonly submitterId: string;
  readonly submitterName: string | null;
  readonly handlerId: string | null;
  readonly handlerName: string | null;
  readonly status: TicketStatus;
  readonly resolutionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TicketListResponse {
  readonly data: Ticket[];
  readonly meta: { readonly canProcess: boolean };
}

export interface TicketResponse {
  readonly data: Ticket;
  readonly meta?: { readonly canProcess: boolean };
}

export interface CreateTicketInput {
  readonly title: string;
  readonly category: TicketCategory;
  readonly description?: string;
}
