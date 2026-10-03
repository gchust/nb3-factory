import type { ApiClient } from '@nocobase/app-client';

/** The categories a request may be filed under. Mirrors the server's list. */
export const IT_TICKET_CATEGORIES = ['computer', 'account', 'other'] as const;
export type ItTicketCategory = (typeof IT_TICKET_CATEGORIES)[number];

/** The states a request moves through. Mirrors the server's list. */
export const IT_TICKET_STATUSES = [
  'pending',
  'processing',
  'completed',
] as const;
export type ItTicketStatus = (typeof IT_TICKET_STATUSES)[number];

/**
 * A repair request as the API returns it.
 *
 * `canStart` and `canComplete` are decided by the server from the caller's
 * permissions and the request's state, so the page offers an action only when
 * the server says the same action would be accepted.
 */
export interface ItTicket {
  readonly id: number;
  readonly title: string;
  readonly category: ItTicketCategory;
  readonly description: string;
  readonly status: ItTicketStatus;
  readonly submitterId: string;
  readonly submitterName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly resolution: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly canStart: boolean;
  readonly canComplete: boolean;
}

export interface ItTicketsListResult {
  readonly data: ItTicket[];
  readonly counts: Record<ItTicketStatus, number>;
  readonly canCreate: boolean;
}

export interface CreateItTicketInput {
  readonly title: string;
  readonly category: ItTicketCategory;
  readonly description: string;
}

/**
 * The repair-request endpoints.
 *
 * The paths are relative to the application's API root, which the caller's
 * `ApiClient` already carries.
 */
export class ItTicketsClient {
  constructor(private readonly api: ApiClient) {}

  list(status?: ItTicketStatus): Promise<ItTicketsListResult> {
    return this.api.request<ItTicketsListResult>({
      path: 'it/tickets',
      query: status === undefined ? undefined : { status },
    });
  }

  get(id: number): Promise<{ data: ItTicket }> {
    return this.api.request<{ data: ItTicket }>({
      path: `it/tickets/${id}`,
    });
  }

  create(input: CreateItTicketInput): Promise<{ data: ItTicket }> {
    return this.api.request<{ data: ItTicket }>({
      path: 'it/tickets',
      method: 'POST',
      json: input,
    });
  }

  start(id: number): Promise<{ data: ItTicket }> {
    return this.api.request<{ data: ItTicket }>({
      path: `it/tickets/${id}/start`,
      method: 'POST',
    });
  }

  complete(id: number, resolution: string): Promise<{ data: ItTicket }> {
    return this.api.request<{ data: ItTicket }>({
      path: `it/tickets/${id}/complete`,
      method: 'POST',
      json: { resolution },
    });
  }
}
