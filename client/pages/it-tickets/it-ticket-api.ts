import type { ApiClient } from '@nocobase/app-client';
import type {
  ItTicket,
  ItTicketCategory,
  ItTicketList,
  ItTicketStatus,
} from './types.js';

/**
 * The few requests this feature makes, in one place.
 *
 * Paths are relative to the API base the shared client already holds: the
 * deployment mount path and `/api` are added by the runtime, so they are never
 * spelled out here, and no request is built from `location`.
 */

export interface ItTicketListQuery {
  readonly status?: ItTicketStatus;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ItTicketCreateRequest {
  readonly title: string;
  readonly category: ItTicketCategory;
  readonly description?: string | null;
}

function ticketPath(ticketId: string): string {
  return `itTickets/${encodeURIComponent(ticketId)}`;
}

export function fetchItTickets(
  api: ApiClient,
  query: ItTicketListQuery = {},
  signal?: AbortSignal,
): Promise<ItTicketList> {
  return api.request<ItTicketList>({
    path: 'itTickets',
    query: {
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    },
    signal,
  });
}

export function fetchItTicket(
  api: ApiClient,
  ticketId: string,
  signal?: AbortSignal,
): Promise<ItTicket> {
  return api
    .request<{ data: ItTicket }>({ path: ticketPath(ticketId), signal })
    .then((body) => body.data);
}

export function createItTicket(
  api: ApiClient,
  input: ItTicketCreateRequest,
): Promise<ItTicket> {
  return api
    .request<{ data: ItTicket }>({
      path: 'itTickets',
      method: 'POST',
      json: {
        title: input.title,
        category: input.category,
        ...(input.description ? { description: input.description } : {}),
      },
    })
    .then((body) => body.data);
}

export function startItTicket(
  api: ApiClient,
  ticketId: string,
): Promise<ItTicket> {
  return api
    .request<{ data: ItTicket }>({
      path: `${ticketPath(ticketId)}/start`,
      method: 'POST',
    })
    .then((body) => body.data);
}

export function completeItTicket(
  api: ApiClient,
  ticketId: string,
  resolutionNote: string,
): Promise<ItTicket> {
  return api
    .request<{ data: ItTicket }>({
      path: `${ticketPath(ticketId)}/complete`,
      method: 'POST',
      json: { resolutionNote },
    })
    .then((body) => body.data);
}
