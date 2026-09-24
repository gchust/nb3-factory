/**
 * Names and row shape shared by the service-request feature's server code, its
 * route, and the seed that configures its initial permission set. Keeping them
 * here means a rename touches one file instead of drifting between the runtime
 * registration and the persisted grant.
 */
export const SERVICE_REQUEST_COLLECTION = 'serviceRequests';
export const SERVICE_REQUEST_WORKFLOW_KEY = 'service-request-acceptance';
export const SERVICE_REQUEST_PERMISSION_SET_KEY = 'service-request-user';

/** Page ids the service-request permission set grants access to. */
export const SERVICE_REQUEST_PAGES = ['service-requests', 'messages'] as const;

export interface ServiceRequestRecord {
  id: number;
  title: string;
  urgent: boolean;
  assigneeId: string | null;
  status: string;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ServiceRequestStatus =
  'pending' | 'processing' | 'accepted_normal' | 'accepted_urgent';
