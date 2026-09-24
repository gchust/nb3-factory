import type { ApiClient } from '@nocobase/app-client';

/**
 * Client-side access to the service request API. Plain functions take an
 * `ApiClient` so a page (through `useApiClient()`) or a test can supply one;
 * nothing here derives the API URL from the browser location.
 */

export type ServiceRequestStatus = 'pending' | 'accepted';
export type ServiceRequestResult = 'urgent' | 'normal';

export interface ServiceRequest {
  readonly id: number;
  readonly reference: string;
  readonly title: string;
  readonly urgent: boolean;
  readonly assigneeId: string;
  readonly status: ServiceRequestStatus;
  readonly result: ServiceRequestResult | null;
  readonly acceptedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceRequestAssignee {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
}

export interface ServiceRequestAcceptOutcome {
  readonly request: ServiceRequest;
  readonly runId: string | null;
  readonly runFinished: boolean;
  readonly alreadyAccepted: boolean;
}

export interface ServiceRequestCreateInput {
  readonly title: string;
  readonly urgent: boolean;
  readonly assigneeId: string;
}

interface DataResponse<T> {
  readonly data: T;
}

export async function listServiceRequests(
  client: ApiClient,
): Promise<ServiceRequest[]> {
  const response = await client.request<DataResponse<ServiceRequest[]>>({
    path: '/service-requests',
  });
  return response.data;
}

export async function getServiceRequest(
  client: ApiClient,
  id: number,
): Promise<ServiceRequest> {
  const response = await client.request<DataResponse<ServiceRequest>>({
    path: `/service-requests/${id}`,
  });
  return response.data;
}

export async function listServiceRequestAssignees(
  client: ApiClient,
): Promise<ServiceRequestAssignee[]> {
  const response = await client.request<DataResponse<ServiceRequestAssignee[]>>(
    {
      path: '/service-requests/assignees',
    },
  );
  return response.data;
}

export async function createServiceRequest(
  client: ApiClient,
  input: ServiceRequestCreateInput,
): Promise<ServiceRequest> {
  const response = await client.request<
    DataResponse<ServiceRequest>,
    ServiceRequestCreateInput
  >({
    path: '/service-requests',
    method: 'POST',
    json: input,
  });
  return response.data;
}

export async function acceptServiceRequest(
  client: ApiClient,
  id: number,
): Promise<ServiceRequestAcceptOutcome> {
  const response = await client.request<
    DataResponse<ServiceRequestAcceptOutcome>
  >({
    path: `/service-requests/${id}/accept`,
    method: 'POST',
  });
  return response.data;
}
