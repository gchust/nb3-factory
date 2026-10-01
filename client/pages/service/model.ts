import {
  ApiClientError,
  useApiClient,
  type ApiClient,
} from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

// The service desk pages talk to the application's own `/api/service` endpoints
// through the shared HTTP client, so requests follow the configured base path
// and share the application's error type.

export type WorkOrderStatus =
  | 'pending_accept'
  | 'pending_handle'
  | 'processing'
  | 'pending_confirm'
  | 'closed';

export type Priority = 'normal' | 'urgent';

export type WorkOrderAction =
  'accept' | 'start' | 'submit' | 'reject' | 'close';

/** Which workflow actions the server accepts from each status. */
export const WORK_ORDER_ACTIONS_BY_STATUS: Readonly<
  Record<WorkOrderStatus, readonly WorkOrderAction[]>
> = {
  pending_accept: ['accept'],
  pending_handle: ['start'],
  processing: ['submit'],
  pending_confirm: ['close', 'reject'],
  closed: [],
};

export interface ServicePrincipal {
  readonly id: string;
  readonly name: string;
  readonly roles: {
    readonly admin: boolean;
    readonly engineer: boolean;
    readonly observer: boolean;
    readonly integrator: boolean;
  };
}

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly notes: string | null;
}

export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly customerId: string;
  readonly serviceEngineerId: string | null;
  readonly enabled: boolean;
  readonly nextInspectionAt: string | null;
  readonly notes: string | null;
}

export interface WorkOrder {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly customerId: string;
  readonly deviceId: string;
  readonly problem: string;
  readonly priority: Priority;
  readonly status: WorkOrderStatus;
  readonly dueAt: string | null;
  readonly assigneeId: string | null;
  readonly confidential: boolean;
  readonly acceptanceNote?: string | null;
  readonly resolution?: string | null;
  readonly rejectionReason?: string | null;
  readonly acceptedAt?: string | null;
  readonly startedAt?: string | null;
  readonly submittedAt?: string | null;
  readonly closedAt?: string | null;
  readonly submitCount?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly events?: readonly WorkOrderEvent[];
  readonly shares?: readonly WorkOrderShare[];
}

export interface WorkOrderEvent {
  readonly id: string;
  readonly type: string;
  readonly actorId: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface WorkOrderShare {
  readonly id: string;
  readonly engineerId: string;
  readonly createdAt: string;
}

export interface Inspection {
  readonly id: string;
  readonly deviceId: string;
  readonly plannedDate: string;
  readonly assigneeId: string | null;
  readonly status: 'pending' | 'completed';
  readonly result: string | null;
  readonly completedAt: string | null;
}

export interface KnowledgeArticle {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
}

export interface Manual {
  readonly id: string;
  readonly title: string;
  readonly filename: string | null;
  readonly content: string | null;
  readonly status: string;
  readonly failureReason: string | null;
  readonly knowledgeBaseKey: string | null;
  readonly documentId: string | null;
}

export interface DashboardSummary {
  readonly workOrders: {
    readonly total: number;
    readonly byStatus: Readonly<Record<WorkOrderStatus, number>>;
    readonly overdue: number;
    readonly byAssignee: Readonly<Record<string, number>>;
  };
  readonly customers: number;
  readonly devices: number;
  readonly pendingInspections: number;
  readonly generatedAt: string;
}

export interface Assignee {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
}

export interface Attachment {
  readonly id: string;
  readonly workOrderId: string;
  readonly fileId: string;
  readonly category: string;
  readonly createdAt: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

/** The lifecycle order the status filters and tabs follow. */
export const WORK_ORDER_STATUS_ORDER: readonly WorkOrderStatus[] = [
  'pending_accept',
  'pending_handle',
  'processing',
  'pending_confirm',
  'closed',
];

export const WORK_ORDER_PRIORITIES: readonly Priority[] = ['normal', 'urgent'];

export function statusLabelKey(status: WorkOrderStatus): string {
  return `service.status.${status}`;
}

export function priorityLabelKey(priority: Priority): string {
  return `service.priority.${priority}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message || `HTTP ${error.status}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface ServiceRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly json?: unknown;
  readonly signal?: AbortSignal;
}

/** One call to the service desk API; `path` is relative to `/api/service`. */
export async function serviceRequest<T>(
  api: ApiClient,
  path: string,
  options: ServiceRequestOptions = {},
): Promise<T> {
  const { data } = await api.request<{ data: T }>({
    path: `service/${path}`,
    method: options.method ?? 'GET',
    json: options.json,
    signal: options.signal,
  });
  return data;
}

/** Uploads one file to a work order through the multipart attachment endpoint. */
export async function uploadWorkOrderAttachment(
  api: ApiClient,
  workOrderId: string,
  file: File,
  category?: string,
): Promise<Attachment> {
  const form = new FormData();
  form.set('file', file);
  if (category) form.set('category', category);
  const { data } = await api.request<{ data: Attachment }>({
    path: `service/work-orders/${workOrderId}/attachments`,
    method: 'POST',
    body: form,
  });
  return data;
}

export interface ResourceState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly reload: () => void;
}

/**
 * Loads one service desk resource. The returned `reload` re-runs the request
 * with fresh state, which the pages call after a successful write.
 */
export function useServiceResource<T>(path: string): ResourceState<T> {
  const api = useApiClient();
  const [state, setState] = useState<{
    data?: T;
    loading: boolean;
    error?: string;
  }>({ loading: true });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    serviceRequest<T>(api, path, { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        setState({ data: result, loading: false });
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        setState({ error: errorMessage(cause), loading: false });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, path, revision]);

  const reload = useCallback(() => {
    setState((current) => ({
      ...current,
      error: undefined,
      loading: true,
    }));
    setRevision((value) => value + 1);
  }, []);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    reload,
  };
}
