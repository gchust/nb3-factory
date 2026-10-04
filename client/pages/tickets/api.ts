import type { ApiClient } from '@nocobase/app-client';

import type {
  CreateTicketInput,
  TicketListResult,
  TicketResult,
  TicketStatus,
} from './types.js';

/**
 * The tickets endpoints, as plain functions so the caller supplies the client.
 *
 * The server scopes the list to the caller's role, so the page never filters
 * by owner itself — passing `status` here is a real server-side filter, not a
 * convenience over a wider response.
 */
export async function fetchTickets(
  api: ApiClient,
  status: TicketStatus | undefined,
  signal?: AbortSignal,
): Promise<TicketListResult> {
  return api.request<TicketListResult>({
    path: 'tickets',
    query: { status },
    signal,
  });
}

export async function fetchTicket(
  api: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<TicketResult> {
  return api.request<TicketResult>({
    path: `tickets/${encodeURIComponent(id)}`,
    signal,
  });
}

export async function createTicket(
  api: ApiClient,
  input: CreateTicketInput,
): Promise<TicketResult> {
  return api.request<TicketResult, CreateTicketInput>({
    path: 'tickets',
    method: 'POST',
    json: input,
  });
}

export async function startTicket(
  api: ApiClient,
  id: string,
): Promise<TicketResult> {
  return api.request<TicketResult>({
    path: `tickets/${encodeURIComponent(id)}/start`,
    method: 'POST',
  });
}

export async function completeTicket(
  api: ApiClient,
  id: string,
  resolution: string,
): Promise<TicketResult> {
  return api.request<TicketResult, { resolution: string }>({
    path: `tickets/${encodeURIComponent(id)}/complete`,
    method: 'POST',
    json: { resolution },
  });
}
