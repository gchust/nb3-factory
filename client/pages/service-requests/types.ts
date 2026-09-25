/**
 * The frontend view of a service request and its assignee picker. The server is
 * the source of truth; these types mirror the fields the route returns.
 */
export const SERVICE_REQUEST_STATUSES = [
  'pending',
  'processing',
  'accepted_normal',
  'accepted_urgent',
] as const;

export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export type ServiceRequestResult = 'normal' | 'urgent' | null;

export interface ServiceRequest {
  readonly id: number;
  readonly title: string;
  readonly urgent: boolean;
  readonly assigneeId: string | null;
  readonly status: ServiceRequestStatus;
  readonly result: ServiceRequestResult;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceRequestAssignee {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

/** What the list page passes to its detail child route through `<Outlet context>`. */
export interface ServiceRequestsOutletContext {
  /** Refreshes the list in the background after the drawer accepts a request. */
  readonly reload: () => void;
}
