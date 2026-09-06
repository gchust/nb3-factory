import { AppRequestError, type AppClient } from '@nocobase/app-client';

/**
 * Client-side mirror of `server/providers/it-ticket-service.ts`. The browser bundle must not import server modules,
 * so the vocabularies and DTO shapes are declared here and kept in sync by convention.
 */
export const TICKET_CATEGORIES = [
  'hardware',
  'software',
  'network',
  'account',
  'other',
] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_STATUSES = [
  'pending',
  'inProgress',
  'resolved',
  'closed',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Allowed status transitions, mirroring the server's lifecycle. */
export const STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> =
  {
    pending: ['inProgress', 'closed'],
    inProgress: ['resolved', 'pending'],
    resolved: ['closed', 'inProgress'],
    closed: ['pending'],
  };

export interface ItTicketView {
  id: number;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  requesterId: string;
  assigneeId: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  requesterName: string;
  assigneeName: string | null;
}

export interface AssigneeCandidate {
  id: string;
  name: string;
  email: string;
}

export interface TicketListResult {
  items: ItTicketView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketListFilters {
  status?: TicketStatus | 'all';
  priority?: TicketPriority | 'all';
  category?: TicketCategory | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TicketInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
}

export interface TicketUpdateInput {
  title?: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  assigneeId?: string | null;
  resolution?: string | null;
}

const TICKETS_PATH = 'it-service-desk/tickets';

interface ListResponse {
  data: ItTicketView[];
  meta: { total: number; page: number; pageSize: number };
}

export function listTickets(
  appClient: AppClient,
  filters: TicketListFilters,
): Promise<TicketListResult> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') {
    params.set('status', filters.status);
  }
  if (filters.priority && filters.priority !== 'all') {
    params.set('priority', filters.priority);
  }
  if (filters.category && filters.category !== 'all') {
    params.set('category', filters.category);
  }
  if (filters.search && filters.search.trim() !== '') {
    params.set('search', filters.search.trim());
  }
  if (filters.page && filters.page > 1) {
    params.set('page', String(filters.page));
  }
  if (filters.pageSize && filters.pageSize > 0) {
    params.set('pageSize', String(filters.pageSize));
  }
  const query = params.toString();

  return appClient
    .request<ListResponse>(`${TICKETS_PATH}${query ? `?${query}` : ''}`)
    .then((response) => ({
      items: response.data,
      total: response.meta.total,
      page: response.meta.page,
      pageSize: response.meta.pageSize,
    }));
}

export function getTicket(
  appClient: AppClient,
  id: number,
): Promise<ItTicketView> {
  return appClient
    .request<{ data: ItTicketView }>(`${TICKETS_PATH}/${id}`)
    .then((response) => response.data);
}

export function createTicket(
  appClient: AppClient,
  input: TicketInput,
): Promise<ItTicketView> {
  return appClient
    .request<{ data: ItTicketView }>(TICKETS_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    .then((response) => response.data);
}

export function updateTicket(
  appClient: AppClient,
  id: number,
  input: TicketUpdateInput,
): Promise<ItTicketView> {
  return appClient
    .request<{ data: ItTicketView }>(`${TICKETS_PATH}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    .then((response) => response.data);
}

export function listStaff(appClient: AppClient): Promise<AssigneeCandidate[]> {
  // The staff endpoint lives under the tickets sub-router, so the path must
  // include the `/tickets` segment. A bare `it-service-desk/staff` request
  // falls through to the SPA catch-all, returns HTML, and `response.data` is
  // undefined — which previously crashed the edit form's `staff.map`.
  return appClient
    .request<{ data: AssigneeCandidate[] }>(`${TICKETS_PATH}/staff`)
    .then((response) => response.data);
}

/** Extracts the server's `{ code, message }` error body when present. */
export function describeRequestError(error: unknown): string | undefined {
  if (error instanceof AppRequestError) {
    const payload = error.payload as { message?: unknown } | null | undefined;
    const message =
      payload && typeof payload.message === 'string' ? payload.message : '';
    return `${error.status}${message ? `: ${message}` : ''}`;
  }
  return undefined;
}
