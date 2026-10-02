import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type { CreateTicketInput, Ticket, TicketStatus } from './types.js';

const BASE = 'it-tickets';

export async function fetchTickets(
  api: ApiClient,
  status?: TicketStatus,
): Promise<Ticket[]> {
  const { data } = await api.request<{ data: Ticket[] }>({
    path: BASE,
    query: status ? { status } : undefined,
  });
  return data;
}

/** Returns `null` when the ticket does not exist or is not visible to the caller. */
export async function fetchTicket(
  api: ApiClient,
  id: string | number,
): Promise<Ticket | null> {
  try {
    const { data } = await api.request<{ data: Ticket }>({
      path: `${BASE}/${encodeURIComponent(String(id))}`,
    });
    return data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}

export async function createTicket(
  api: ApiClient,
  input: CreateTicketInput,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }, CreateTicketInput>({
    path: BASE,
    method: 'POST',
    json: input,
  });
  return data;
}

export async function startTicket(
  api: ApiClient,
  id: string | number,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }>({
    path: `${BASE}/${encodeURIComponent(String(id))}/start`,
    method: 'POST',
  });
  return data;
}

export async function completeTicket(
  api: ApiClient,
  id: string | number,
  resolution: string,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }, { resolution: string }>({
    path: `${BASE}/${encodeURIComponent(String(id))}/complete`,
    method: 'POST',
    json: { resolution },
  });
  return data;
}
