import type { ApiClient } from '@nocobase/app-client';

import type {
  AssignTicketInput,
  CreateTicketInput,
  Engineer,
  ResolveTicketInput,
  ReturnTicketInput,
  ServiceDeskDashboard,
  Ticket,
  TicketDetail,
  TicketListQuery,
  TicketPage,
} from './types.js';

/**
 * The service desk's HTTP calls. Every function takes the `ApiClient` the page
 * obtained from `useApiClient()`, so the base path and credentials live in one
 * place. The API answers `{ data }` on success and `{ data, meta }` for a page.
 */

interface DataResponse<T> {
  readonly data: T;
}

interface PageResponse<T> {
  readonly data: T;
  readonly meta: {
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  };
}

export async function fetchTickets(
  api: ApiClient,
  query: TicketListQuery,
): Promise<TicketPage> {
  const response = await api.request<PageResponse<readonly Ticket[]>>({
    path: '/tickets',
    query: {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      urgency: query.urgency,
      keyword: query.keyword,
      assigneeId: query.assigneeId,
      requesterId: query.requesterId,
    },
  });
  return {
    items: response.data,
    total: response.meta?.total ?? response.data.length,
    page: response.meta?.page ?? 1,
    pageSize: response.meta?.pageSize ?? response.data.length,
  };
}

export async function fetchDashboard(
  api: ApiClient,
): Promise<ServiceDeskDashboard> {
  const response = await api.request<DataResponse<ServiceDeskDashboard>>({
    path: '/tickets/dashboard',
  });
  return response.data;
}

export async function fetchTicket(
  api: ApiClient,
  ticketId: number,
): Promise<TicketDetail> {
  const response = await api.request<DataResponse<TicketDetail>>({
    path: `/tickets/${ticketId}`,
  });
  return response.data;
}

export async function fetchEngineers(
  api: ApiClient,
): Promise<readonly Engineer[]> {
  const response = await api.request<DataResponse<readonly Engineer[]>>({
    path: '/engineers',
  });
  return response.data;
}

export async function createTicket(
  api: ApiClient,
  input: CreateTicketInput,
): Promise<Ticket> {
  const response = await api.request<DataResponse<Ticket>>({
    path: '/tickets',
    method: 'POST',
    json: input,
  });
  return response.data;
}

export async function assignTicket(
  api: ApiClient,
  ticketId: number,
  input: AssignTicketInput,
): Promise<TicketDetail> {
  return postDetail(api, ticketId, 'assign', input);
}

export async function resolveTicket(
  api: ApiClient,
  ticketId: number,
  input: ResolveTicketInput,
): Promise<TicketDetail> {
  return postDetail(api, ticketId, 'resolve', input);
}

export async function confirmTicket(
  api: ApiClient,
  ticketId: number,
): Promise<TicketDetail> {
  return postDetail(api, ticketId, 'confirm', {});
}

export async function returnTicket(
  api: ApiClient,
  ticketId: number,
  input: ReturnTicketInput,
): Promise<TicketDetail> {
  return postDetail(api, ticketId, 'return', input);
}

export async function commentTicket(
  api: ApiClient,
  ticketId: number,
  content: string,
): Promise<TicketDetail> {
  return postDetail(api, ticketId, 'comments', { content });
}

async function postDetail<TInput>(
  api: ApiClient,
  ticketId: number,
  action: string,
  input: TInput,
): Promise<TicketDetail> {
  const response = await api.request<DataResponse<TicketDetail>>({
    path: `/tickets/${ticketId}/${action}`,
    method: 'POST',
    json: input,
  });
  return response.data;
}
