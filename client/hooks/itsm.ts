import { resolveAppUrl, useApiClient } from '@nocobase/app-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

/**
 * The client half of the service desk: the shapes the ticket API returns, the
 * shared status vocabulary, and the queries and commands the pages use.
 */

export const TICKET_STATUSES = [
  'pending',
  'processing',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_URGENCIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];

export type TicketRole = 'employee' | 'engineer' | 'service-desk';

export interface TicketScreenshot {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface Ticket {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly urgency: TicketUrgency;
  readonly status: TicketStatus;
  readonly requesterId: string;
  readonly requesterName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly resolution: string | null;
  readonly screenshots: readonly TicketScreenshot[];
  readonly submittedAt: string;
  readonly assignedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly lastReturnedAt: string | null;
  readonly returnCount: number;
  readonly overdue: boolean;
  readonly updatedAt: string;
}

export interface TicketLog {
  readonly id: number;
  readonly kind: string;
  readonly content: string;
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly createdAt: string;
}

export interface TicketDetail extends Ticket {
  readonly logs: readonly TicketLog[];
}

export interface TicketListResult {
  readonly items: readonly Ticket[];
  readonly total: number;
}

export interface Workload {
  readonly engineerId: string;
  readonly engineerName: string;
  readonly active: number;
  readonly resolved: number;
}

export interface DashboardSummary {
  readonly role: TicketRole;
  readonly pendingAssignment: readonly Ticket[];
  readonly overdue: readonly Ticket[];
  readonly workloads: readonly Workload[];
}

export interface EngineerOption {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface TicketListParams {
  readonly status?: TicketStatus;
  readonly urgency?: TicketUrgency;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export function isTicketStatus(value: string | null): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value ?? '');
}

export function isTicketUrgency(value: string | null): value is TicketUrgency {
  return (TICKET_URGENCIES as readonly string[]).includes(value ?? '');
}

/** Where the file exposure serves a screenshot's bytes. */
export function ticketScreenshotUrl(screenshot: TicketScreenshot): string {
  return resolveAppUrl(`/uploads/tickets/${screenshot.id}.${screenshot.ext}`);
}

export const itsmKeys = {
  all: ['itsm'] as const,
  dashboard: () => ['itsm', 'dashboard'] as const,
  tickets: (params: TicketListParams) => ['itsm', 'tickets', params] as const,
  ticket: (ticketId: string) => ['itsm', 'ticket', ticketId] as const,
  engineers: () => ['itsm', 'engineers'] as const,
};

function useInvalidateItsm(): () => void {
  const client = useQueryClient();
  return useCallback(() => {
    void client.invalidateQueries({ queryKey: itsmKeys.all });
  }, [client]);
}

export function useTicketDashboard() {
  const api = useApiClient();
  return useQuery({
    queryKey: itsmKeys.dashboard(),
    queryFn: async () =>
      (
        await api.request<{ data: DashboardSummary }>({
          path: 'tickets/dashboard',
        })
      ).data,
  });
}

/** The role the server resolves for the signed-in caller, read from the dashboard. */
export function useItsmRole(): TicketRole | undefined {
  return useTicketDashboard().data?.role;
}

export function useTicketList(params: TicketListParams) {
  const api = useApiClient();
  return useQuery({
    queryKey: itsmKeys.tickets(params),
    queryFn: async () => {
      const response = await api.request<{
        data: Ticket[];
        meta: { total: number };
      }>({
        path: 'tickets',
        query: {
          status: params.status,
          urgency: params.urgency,
          search: params.search,
          limit: params.limit,
          offset: params.offset,
        },
      });
      return { items: response.data, total: response.meta.total };
    },
  });
}

export function useTicketDetail(ticketId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: itsmKeys.ticket(ticketId),
    enabled: ticketId.length > 0,
    queryFn: async () =>
      (
        await api.request<{ data: TicketDetail }>({
          path: `tickets/${ticketId}`,
        })
      ).data,
  });
}

export function useEngineers() {
  const api = useApiClient();
  return useQuery({
    queryKey: itsmKeys.engineers(),
    queryFn: async () => {
      const response = await api.request<{ data: EngineerOption[] }>({
        path: 'tickets/engineers',
      });
      return response.data;
    },
  });
}

export type TicketAction =
  'assign' | 'process' | 'resolve' | 'confirm' | 'return' | 'comment';

/**
 * Runs one ticket command. Every command answers with the updated ticket, so
 * the pages reload from the response instead of refetching; the caches are
 * invalidated too, which is what refreshes the list behind an open drawer.
 */
export function useTicketActions(ticketId: string): {
  readonly run: (action: TicketAction, json?: unknown) => Promise<TicketDetail>;
  readonly pending: TicketAction | null;
  readonly error: unknown;
} {
  const api = useApiClient();
  const invalidate = useInvalidateItsm();
  const [pending, setPending] = useState<TicketAction | null>(null);
  const [error, setError] = useState<unknown>(undefined);

  const run = useCallback(
    async (action: TicketAction, json?: unknown) => {
      setPending(action);
      setError(undefined);
      try {
        const response = await api.request<{ data: TicketDetail }>({
          path: `tickets/${ticketId}/${action}`,
          method: 'POST',
          ...(json === undefined ? {} : { json }),
        });
        invalidate();
        return response.data;
      } catch (cause: unknown) {
        setError(cause);
        throw cause;
      } finally {
        setPending(null);
      }
    },
    [api, invalidate, ticketId],
  );

  return { run, pending, error };
}

export interface CreateTicketValues {
  readonly title: string;
  readonly description: string;
  readonly urgency: TicketUrgency;
  readonly screenshotIds: readonly string[];
}

export function useCreateTicket(): {
  readonly create: (values: CreateTicketValues) => Promise<TicketDetail>;
  readonly pending: boolean;
  readonly error: unknown;
} {
  const api = useApiClient();
  const invalidate = useInvalidateItsm();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  const create = useCallback(
    async (values: CreateTicketValues) => {
      setPending(true);
      setError(undefined);
      try {
        const response = await api.request<{ data: TicketDetail }>({
          path: 'tickets',
          method: 'POST',
          json: values,
        });
        invalidate();
        return response.data;
      } catch (cause: unknown) {
        setError(cause);
        throw cause;
      } finally {
        setPending(false);
      }
    },
    [api, invalidate],
  );

  return { create, pending, error };
}

/**
 * Uploads screenshots through the file exposure and returns the file ids the
 * ticket stores. Upload and submit are separate commits, as the file plugin
 * requires; the ids are handed to `POST /tickets` when the form is submitted.
 */
export function useUploadScreenshots(): {
  readonly upload: (files: readonly File[]) => Promise<string[]>;
  readonly pending: boolean;
  readonly error: unknown;
} {
  const api = useApiClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  const upload = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) return [];
      setPending(true);
      setError(undefined);
      try {
        const body = new FormData();
        for (const file of files) body.append('file', file);
        const response = await api.request<{
          data: { records: readonly { id: string }[] };
        }>({
          path: 'ticketAttachments/uploadMany',
          method: 'POST',
          body,
        });
        return response.data.records.map((record) => record.id);
      } catch (cause: unknown) {
        setError(cause);
        throw cause;
      } finally {
        setPending(false);
      }
    },
    [api],
  );

  return { upload, pending, error };
}
