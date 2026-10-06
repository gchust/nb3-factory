import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type { TicketDto } from './types.js';

/**
 * The repair-ticket API calls.
 *
 * The server owns every rule — record scope, workflow state, validation — so
 * these functions only carry input and surface the response. A failure arrives
 * as an `ApiClientError` whose `code` is the server's error code; `errorKey`
 * turns it into a translation key and never invents wording here.
 */

interface ItemResponse {
  readonly data: TicketDto;
}

interface ListResponse {
  readonly data: TicketDto[];
}

export async function fetchTickets(
  api: ApiClient,
  status?: string,
): Promise<TicketDto[]> {
  const response = await api.request<ListResponse>({
    path: '/tickets',
    query: status ? { status } : undefined,
  });
  return response.data;
}

export async function fetchTicket(
  api: ApiClient,
  id: string,
): Promise<TicketDto> {
  const response = await api.request<ItemResponse>({
    path: `/tickets/${encodeURIComponent(id)}`,
  });
  return response.data;
}

export async function createTicket(
  api: ApiClient,
  input: { title: string; category: string; description: string | null },
): Promise<TicketDto> {
  const response = await api.request<ItemResponse, typeof input>({
    path: '/tickets',
    method: 'POST',
    json: input,
  });
  return response.data;
}

export async function startTicket(
  api: ApiClient,
  id: string,
): Promise<TicketDto> {
  const response = await api.request<ItemResponse>({
    path: `/tickets/${encodeURIComponent(id)}/start`,
    method: 'POST',
  });
  return response.data;
}

export async function completeTicket(
  api: ApiClient,
  id: string,
  resolution: string,
): Promise<TicketDto> {
  const response = await api.request<ItemResponse, { resolution: string }>({
    path: `/tickets/${encodeURIComponent(id)}/complete`,
    method: 'POST',
    json: { resolution },
  });
  return response.data;
}

const KNOWN_CODES = new Set([
  'INVALID_TITLE',
  'INVALID_CATEGORY',
  'INVALID_DESCRIPTION',
  'INVALID_RESOLUTION',
  'INVALID_STATUS',
  'FORBIDDEN',
  'TICKET_NOT_FOUND',
  'TICKET_NOT_PENDING',
  'TICKET_NOT_PROCESSING',
  'TICKET_HANDLED_BY_OTHER',
  'TICKET_COMPLETED',
  'TICKET_STATE_CHANGED',
]);

/** A translation key for a failed request; unknown failures fall back to a generic message. */
export function errorKey(error: unknown): string {
  if (
    error instanceof ApiClientError &&
    error.code &&
    KNOWN_CODES.has(error.code)
  ) {
    return `tickets.errors.${error.code}`;
  }
  return 'tickets.errors.unknown';
}
