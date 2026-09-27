import type { ApiClient } from '@nocobase/app-client';

/**
 * The service-request contract shared by the pages. The server owns these
 * shapes; nothing here is validated at runtime.
 */
export interface ServiceRequest {
  readonly id: number;
  readonly title: string;
  readonly urgent: boolean;
  readonly assigneeId: string;
  readonly status: string;
  readonly result: string | null;
  readonly acceptedAt: string | null;
  readonly createdAt: string;
}

export interface ServiceRequestAssignee {
  readonly id: string;
  readonly name: string;
}

export interface CreateServiceRequestInput {
  readonly title: string;
  readonly urgent: boolean;
  readonly assigneeId: string;
}

export interface ServiceRequestAcceptance {
  readonly runId: string;
  readonly request: ServiceRequest;
}

export async function fetchServiceRequests(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<ServiceRequest[]> {
  const { data } = await api.request<{ data: ServiceRequest[] }>({
    path: 'service-requests',
    signal,
  });
  return data;
}

export async function fetchServiceRequest(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<ServiceRequest> {
  const { data } = await api.request<{ data: ServiceRequest }>({
    path: `service-requests/${encodeURIComponent(id)}`,
    signal,
  });
  return data;
}

export async function fetchServiceRequestAssignees(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<ServiceRequestAssignee[]> {
  const { data } = await api.request<{ data: ServiceRequestAssignee[] }>({
    path: 'service-requests/assignees',
    signal,
  });
  return data;
}

export async function createServiceRequest(
  api: ApiClient,
  input: CreateServiceRequestInput,
): Promise<ServiceRequest> {
  const { data } = await api.request<{ data: ServiceRequest }>({
    path: 'service-requests',
    method: 'POST',
    json: input,
  });
  return data;
}

/**
 * Ask the server to register the acceptance. The endpoint answers only after
 * the acceptance workflow has finished, so the returned request already carries
 * the acceptance status and the derived result.
 */
export async function acceptServiceRequest(
  api: ApiClient,
  id: number | string,
): Promise<ServiceRequestAcceptance> {
  const { data } = await api.request<{ data: ServiceRequestAcceptance }>({
    path: `service-requests/${encodeURIComponent(id)}/accept`,
    method: 'POST',
  });
  return data;
}
