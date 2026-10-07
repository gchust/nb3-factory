import type { ApiClient } from '@nocobase/app-client';

import type { Engineer, Ticket, TicketStats, Viewer } from './types.js';

export interface TicketListQuery {
  readonly status?: string;
  readonly urgency?: string;
  readonly overdue?: boolean;
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly screenshot?: string | null;
}

export async function fetchViewer(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Viewer> {
  const { data } = await api.request<{ data: Viewer }>({
    path: 'helpdesk/me',
    signal,
  });
  return data;
}

export async function fetchStats(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<TicketStats> {
  const { data } = await api.request<{ data: TicketStats }>({
    path: 'helpdesk/stats',
    signal,
  });
  return data;
}

export async function fetchEngineers(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Engineer[]> {
  const { data } = await api.request<{ data: Engineer[] }>({
    path: 'helpdesk/engineers',
    signal,
  });
  return [...data];
}

export async function fetchTickets(
  api: ApiClient,
  query: TicketListQuery = {},
  signal?: AbortSignal,
): Promise<{ readonly data: Ticket[]; readonly total: number }> {
  const response = await api.request<
    { data: Ticket[]; meta: { total: number } },
    undefined
  >({
    path: 'helpdesk/tickets',
    query: {
      status: query.status || undefined,
      urgency: query.urgency || undefined,
      overdue: query.overdue,
      q: query.q || undefined,
      page: query.page,
      pageSize: query.pageSize,
    },
    signal,
  });
  return { data: [...response.data], total: response.meta.total };
}

export async function fetchTicket(
  api: ApiClient,
  id: string | number,
  signal?: AbortSignal,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }>({
    path: `helpdesk/tickets/${encodeURIComponent(String(id))}`,
    signal,
  });
  return data;
}

export async function createTicket(
  api: ApiClient,
  input: CreateTicketInput,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }, CreateTicketInput>({
    path: 'helpdesk/tickets',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function assignTicket(
  api: ApiClient,
  id: number,
  assigneeId: string,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }, { assigneeId: string }>({
    path: `helpdesk/tickets/${id}/assign`,
    method: 'POST',
    json: { assigneeId },
  });
  return data;
}

export async function processTicket(
  api: ApiClient,
  id: number,
  content: string,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }, { content: string }>({
    path: `helpdesk/tickets/${id}/process`,
    method: 'POST',
    json: { content },
  });
  return data;
}

export async function resolveTicket(
  api: ApiClient,
  id: number,
  solution: string,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }, { solution: string }>({
    path: `helpdesk/tickets/${id}/resolve`,
    method: 'POST',
    json: { solution },
  });
  return data;
}

export async function confirmTicket(
  api: ApiClient,
  id: number,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }>({
    path: `helpdesk/tickets/${id}/confirm`,
    method: 'POST',
    json: {},
  });
  return data;
}

export async function rejectTicket(
  api: ApiClient,
  id: number,
  content: string,
): Promise<Ticket> {
  const { data } = await api.request<{ data: Ticket }, { content: string }>({
    path: `helpdesk/tickets/${id}/reject`,
    method: 'POST',
    json: { content },
  });
  return data;
}
