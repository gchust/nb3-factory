import type { ApiClient } from '@nocobase/app-client';

import type {
  CreateTicketInput,
  TicketListResponse,
  TicketResponse,
  TicketStatus,
} from './types.js';

/** Reads the tickets the caller may see, optionally narrowed to one status. */
export async function fetchTickets(
  api: ApiClient,
  options: {
    readonly status?: TicketStatus;
    readonly signal?: AbortSignal;
  } = {},
): Promise<TicketListResponse> {
  return api.request<TicketListResponse>({
    path: 'it-tickets',
    query: { status: options.status },
    signal: options.signal,
  });
}

export async function fetchTicket(
  api: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<TicketResponse> {
  return api.request<TicketResponse>({
    path: `it-tickets/${id}`,
    signal,
  });
}

export async function createTicket(
  api: ApiClient,
  input: CreateTicketInput,
): Promise<TicketResponse> {
  return api.request<TicketResponse, CreateTicketInput>({
    path: 'it-tickets',
    method: 'POST',
    json: input,
  });
}

export async function startTicket(
  api: ApiClient,
  id: number,
): Promise<TicketResponse> {
  return api.request<TicketResponse>({
    path: `it-tickets/${id}/start`,
    method: 'POST',
  });
}

export async function completeTicket(
  api: ApiClient,
  id: number,
  resolutionNote: string,
): Promise<TicketResponse> {
  return api.request<TicketResponse, { resolutionNote: string }>({
    path: `it-tickets/${id}/complete`,
    method: 'POST',
    json: { resolutionNote },
  });
}
