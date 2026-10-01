import type { ApiClient } from '@nocobase/app-client';

import type { ItTicket, ItTicketCapabilities } from './types.js';

/** Input the create endpoint accepts. */
export interface ItTicketCreateInput {
  readonly title: string;
  readonly category: string;
  readonly description?: string;
}

export async function fetchItTickets(
  api: ApiClient,
  options: {
    readonly status?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<{ data: ItTicket[]; capabilities: ItTicketCapabilities }> {
  return api.request<{
    data: ItTicket[];
    capabilities: ItTicketCapabilities;
  }>({
    path: 'it-tickets',
    query: {
      pageSize: 100,
      ...(options.status ? { status: options.status } : {}),
    },
    signal: options.signal,
  });
}

export async function fetchItTicket(
  api: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<{ data: ItTicket; capabilities: ItTicketCapabilities }> {
  return api.request<{
    data: ItTicket;
    capabilities: ItTicketCapabilities;
  }>({
    path: `it-tickets/${encodeURIComponent(id)}`,
    signal,
  });
}

export async function createItTicket(
  api: ApiClient,
  input: ItTicketCreateInput,
): Promise<ItTicket> {
  const { data } = await api.request<{ data: ItTicket }>({
    path: 'it-tickets',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function startItTicket(
  api: ApiClient,
  id: string,
): Promise<ItTicket> {
  const { data } = await api.request<{ data: ItTicket }>({
    path: `it-tickets/${encodeURIComponent(id)}/start`,
    method: 'POST',
  });
  return data;
}

export async function completeItTicket(
  api: ApiClient,
  id: string,
  resolution: string,
): Promise<ItTicket> {
  const { data } = await api.request<{ data: ItTicket }>({
    path: `it-tickets/${encodeURIComponent(id)}/complete`,
    method: 'POST',
    json: { resolution },
  });
  return data;
}
