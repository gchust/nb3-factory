import { useCallback } from 'react';
import { useApiClient } from '@nocobase/app-client';

/**
 * Shared HTTP access for the after-sales service pages. The endpoints live
 * under the application's `/api` base, so a path here is written relative to
 * it (`/service/tickets`).
 */

export interface ServiceEnvelope<T> {
  readonly data: T;
}

export type RequestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  readonly method?: RequestMethod;
  readonly json?: unknown;
  readonly query?: Readonly<
    Record<string, string | number | boolean | null | undefined>
  >;
}

export type ServiceRequest = <T>(
  path: string,
  options?: RequestOptions,
) => Promise<T>;

export function useServiceRequest(): ServiceRequest {
  const api = useApiClient();
  return useCallback(
    async <T>(path: string, options?: RequestOptions): Promise<T> => {
      const payload = await api.request<ServiceEnvelope<T>>({
        path,
        method: options?.method ?? 'GET',
        json: options?.json,
        query: options?.query,
      });
      return payload.data;
    },
    [api],
  );
}

export type TicketStatus =
  | 'pending'
  | 'accepted'
  | 'processing'
  | 'pending_confirm'
  | 'closed'
  | 'returned';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type DeviceStatus = 'active' | 'maintenance' | 'disabled';
export type InspectionStatus =
  'planned' | 'in_progress' | 'completed' | 'overdue';

/** A ticket row plus the labels the service enriches it with. */
export interface TicketRecord {
  readonly id: number;
  readonly ticketNo: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly confidential: boolean;
  readonly customerId: number | null;
  readonly deviceId: number | null;
  readonly assigneeId: number | null;
  readonly reporterId: number | null;
  readonly source: 'internal' | 'external';
  readonly externalEventNo: string | null;
  readonly acceptedAt: string | null;
  readonly startedAt: string | null;
  readonly submittedAt: string | null;
  readonly closedAt: string | null;
  readonly slaDueAt: string | null;
  readonly handling: string | null;
  readonly resolution: string | null;
  readonly acceptanceNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly customerName: string | null;
  readonly customerCode: string | null;
  readonly deviceNo: string | null;
  readonly deviceModel: string | null;
  readonly assigneeName: string | null;
}

export interface TicketEvent {
  readonly id: number;
  readonly ticketId: number;
  readonly type: string;
  readonly status: TicketStatus | null;
  readonly operatorId: number | null;
  readonly operatorName: string | null;
  readonly comment: string | null;
  readonly payload: Record<string, unknown> | null;
  readonly createdAt: string;
}

export interface TicketShare {
  readonly id: number;
  readonly ticketId: number;
  readonly granteeId: number;
  readonly granteeName: string | null;
  readonly grantedById: number | null;
  readonly reason: string | null;
  readonly sharingRuleKey: string | null;
  readonly expiresAt: string | null;
  readonly revoked: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TicketAttachment {
  readonly id: number;
  readonly ticketId: number;
  readonly fileId: string;
  readonly kind: string;
  readonly note: string | null;
  readonly createdById: number | null;
  readonly createdAt: string;
  readonly filename: string | null;
  readonly mimeType: string | null;
  readonly size: number | null;
  readonly ext: string | null;
  readonly contentUrl: string | null;
}

export interface AcceptanceState {
  readonly pending: boolean;
  readonly lastFailed: boolean;
  readonly attempts: number;
}

export interface TicketDetail {
  readonly ticket: TicketRecord;
  readonly events: readonly TicketEvent[];
  readonly shares: readonly TicketShare[];
  readonly attachments: readonly TicketAttachment[];
  readonly capabilities: readonly string[];
  readonly acceptance: AcceptanceState;
}

export interface Paged<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface CustomerRecord {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly contact: string | null;
  readonly phone: string | null;
  readonly level: string;
  readonly region: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeviceRecord {
  readonly id: number;
  readonly deviceNo: string;
  readonly model: string;
  readonly serialNo: string | null;
  readonly customerId: number | null;
  readonly status: DeviceStatus;
  readonly installedAt: string | null;
  readonly warrantyUntil: string | null;
  readonly nextInspectionAt: string | null;
  readonly location: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly customerName: string | null;
}

export interface InspectionRecord {
  readonly id: number;
  readonly deviceId: number;
  readonly plannedDate: string;
  readonly status: InspectionStatus;
  readonly assigneeId: number | null;
  readonly result: string | null;
  readonly notes: string | null;
  readonly ticketId: number | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deviceNo?: string;
  readonly deviceModel?: string;
  readonly assigneeName?: string;
}

export interface KnowledgeRecord {
  readonly id: number;
  readonly title: string;
  readonly category: string | null;
  readonly deviceModel: string | null;
  readonly tags: string | null;
  readonly status: string;
  readonly summary: string | null;
  readonly content: string;
  readonly createdById: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EngineerLoad {
  readonly id: string;
  readonly name: string;
  readonly openTickets: number;
}

export interface DashboardSummary {
  readonly scope: 'all' | 'assigned' | 'shared';
  readonly generatedAt: string;
  readonly tickets: {
    readonly total: number;
    readonly open: number;
    readonly pending: number;
    readonly urgent: number;
    readonly overdue: number;
    readonly closed: number;
    readonly byStatus: Readonly<Record<string, number>>;
  };
  readonly devices: {
    readonly total: number;
    readonly active: number;
    readonly maintenance: number;
    readonly disabled: number;
  };
  readonly inspections: {
    readonly total: number;
    readonly planned: number;
    readonly inProgress: number;
    readonly overdue: number;
    readonly completed: number;
  };
  readonly workload: readonly {
    readonly engineerId: string;
    readonly name: string;
    readonly open: number;
  }[];
}

export interface AssistantDraft {
  readonly draft: string;
  readonly sources: readonly { readonly id: number; readonly title: string }[];
  readonly language: 'zh-CN' | 'en-US';
}
