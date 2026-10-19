import { ApiClientError, type ApiClient } from '@nocobase/app-client';

import type {
  DataResponse,
  ListResponse,
  SortOrder,
  TicketDashboard,
  TicketDetail,
  TicketEngineer,
  TicketSort,
  TicketStatusFilter,
  TicketSummary,
  TicketUrgency,
  UploadedFile,
} from './types.js';

/**
 * A 4xx answer is final: retrying a missing or forbidden ticket only delays the
 * message the page has to show. Server failures stay eligible for a short retry.
 */
export function shouldRetryRequest(
  failureCount: number,
  error: unknown,
): boolean {
  if (
    error instanceof ApiClientError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return false;
  }
  return failureCount < 2;
}

export interface TicketListQuery {
  readonly q?: string;
  readonly status?: TicketStatusFilter;
  readonly urgency?: TicketUrgency;
  readonly sort: TicketSort;
  readonly order: SortOrder;
  readonly page: number;
  readonly pageSize: number;
}

export type TicketAction =
  | { readonly kind: 'assign'; readonly assigneeId: string }
  | { readonly kind: 'progress'; readonly content: string }
  | { readonly kind: 'resolve'; readonly resolution: string }
  | { readonly kind: 'return'; readonly reason: string }
  | { readonly kind: 'comment'; readonly content: string }
  | { readonly kind: 'close' };

export function listTickets(
  api: ApiClient,
  query: TicketListQuery,
  signal?: AbortSignal,
): Promise<ListResponse<TicketSummary>> {
  return api.request<ListResponse<TicketSummary>>({
    path: '/tickets',
    query: {
      q: query.q || undefined,
      status: query.status,
      urgency: query.urgency,
      sort: query.sort,
      order: query.order,
      page: query.page,
      pageSize: query.pageSize,
    },
    signal,
  });
}

export function getTicket(
  api: ApiClient,
  ticketId: number,
  signal?: AbortSignal,
): Promise<DataResponse<TicketDetail>> {
  return api.request<DataResponse<TicketDetail>>({
    path: `/tickets/${ticketId}`,
    signal,
  });
}

export function getDashboard(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<DataResponse<TicketDashboard>> {
  return api.request<DataResponse<TicketDashboard>>({
    path: '/tickets/dashboard',
    signal,
  });
}

export function getEngineers(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<DataResponse<readonly TicketEngineer[]>> {
  return api.request<DataResponse<readonly TicketEngineer[]>>({
    path: '/tickets/engineers',
    signal,
  });
}

export function createTicket(
  api: ApiClient,
  input: {
    readonly title: string;
    readonly description: string;
    readonly urgency: TicketUrgency;
    readonly fileIds: readonly string[];
  },
): Promise<DataResponse<TicketDetail>> {
  return api.request<DataResponse<TicketDetail>>({
    path: '/tickets',
    method: 'POST',
    json: input,
  });
}

export function runTicketAction(
  api: ApiClient,
  ticketId: number,
  action: TicketAction,
): Promise<DataResponse<TicketDetail>> {
  const path =
    action.kind === 'assign'
      ? `/tickets/${ticketId}/assign`
      : action.kind === 'comment'
        ? `/tickets/${ticketId}/comments`
        : `/tickets/${ticketId}/${action.kind}`;
  const json =
    action.kind === 'assign'
      ? { assigneeId: action.assigneeId }
      : action.kind === 'resolve'
        ? { resolution: action.resolution }
        : action.kind === 'return'
          ? { reason: action.reason }
          : action.kind === 'close'
            ? undefined
            : { content: action.content };
  return api.request<DataResponse<TicketDetail>>({
    path,
    method: 'POST',
    ...(json === undefined ? {} : { json }),
  });
}

/**
 * Uploads screenshots before the ticket is submitted. The response records are
 * the unclaimed uploads the create endpoint binds to the new ticket.
 */
export async function uploadScreenshots(
  api: ApiClient,
  files: readonly File[],
): Promise<readonly UploadedFile[]> {
  const body = new FormData();
  for (const file of files) body.append('file', file);
  const result = await api.request<
    DataResponse<{ readonly records: readonly UploadedFile[] }>
  >({
    path: '/itTicketFiles/uploadMany',
    method: 'POST',
    body,
  });
  return result.data.records;
}
