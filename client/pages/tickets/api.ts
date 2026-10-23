import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState } from 'react';

/** The query scalars these pages send; `undefined` means "no filter". */
export type TicketQuery = Readonly<Record<string, string | number | undefined>>;

/** One repair ticket, as the API returns it. */
export interface Ticket {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly urgency: TicketUrgency;
  readonly status: TicketStatus;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
  readonly reporterId: string;
  readonly reporterName: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly resolution: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly reopenCount: number;
  readonly lastReopenedAt: string | null;
  readonly overdueNotifiedAt: string | null;
  readonly attachmentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TicketUrgency = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus =
  'submitted' | 'assigned' | 'inProgress' | 'resolved' | 'closed';

export const TICKET_STATUSES: readonly TicketStatus[] = [
  'submitted',
  'assigned',
  'inProgress',
  'resolved',
  'closed',
];

export const TICKET_URGENCIES: readonly TicketUrgency[] = [
  'low',
  'normal',
  'high',
  'urgent',
];

export const TICKET_CATEGORIES: readonly string[] = [
  'hardware',
  'software',
  'network',
  'account',
  'other',
];

/** One lifecycle transition, the verb a person performs on a ticket. */
export type TicketTransition =
  | 'assign'
  | 'reassign'
  | 'start'
  | 'resolve'
  | 'confirm'
  | 'returnForRework'
  | 'reopen';

export interface TicketComment {
  readonly id: string;
  readonly ticketId: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly kind: 'comment' | 'resolution' | 'system';
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TransitionBlocker {
  readonly source: 'state' | 'guard' | 'manual';
  readonly kind: 'permission' | 'precondition';
  readonly code: string;
  readonly message: string;
}

export interface AvailableTransition {
  readonly name: TicketTransition;
  readonly title: string;
  readonly to: string;
  readonly allowed: boolean;
  readonly blockers: readonly TransitionBlocker[];
}

export interface TicketTransitionEntry {
  readonly id: string;
  readonly lifecycle: string;
  readonly recordId: string;
  readonly transition: string;
  readonly from: string | null;
  readonly to: string;
  readonly actorId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly at: string;
  readonly version: number;
  readonly requestId: string | null;
}

export interface TicketEffectRun {
  readonly id: string;
  readonly transitionId: string;
  readonly effect: string;
  readonly stayBound: boolean;
  readonly status: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly error: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TicketHistory {
  readonly transitions: readonly TicketTransitionEntry[];
  readonly effectRuns: readonly TicketEffectRun[];
}

export interface TicketDetail {
  readonly ticket: Ticket;
  readonly version: number | null;
  readonly available: readonly AvailableTransition[];
  readonly history: TicketHistory;
  readonly comments: readonly TicketComment[];
}

export interface TicketWorkloadRow {
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly active: number;
  readonly waiting: number;
}

export interface TicketDashboard {
  readonly pendingAssignment: number;
  readonly inProgress: number;
  readonly waitingConfirmation: number;
  readonly overdue: number;
  readonly reportedByMe: number;
  readonly assignedToMe: number;
  readonly overdueHours: number;
  readonly workload: readonly TicketWorkloadRow[];
  readonly recent: readonly Ticket[];
}

export interface TicketAssignee {
  readonly id: string;
  readonly name: string;
}

export interface TicketExecutionRow {
  readonly id: string;
  readonly recordId: string;
  readonly recordTitle: string;
  readonly transition: string;
  readonly from: string | null;
  readonly to: string;
  readonly actorId: string | null;
  readonly at: string;
  readonly version: number;
}

export interface TicketEffectRow {
  readonly id: string;
  readonly recordId: string;
  readonly effect: string;
  readonly status: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly error: string | null;
  readonly createdAt: string;
}

export interface TicketExecutions {
  readonly transitions: readonly TicketExecutionRow[];
  readonly effects: readonly TicketEffectRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface TicketDefinition {
  readonly name: string;
  readonly title: string;
  readonly collection: string;
  readonly states: readonly string[];
  readonly parameters: {
    readonly overdueHours: number;
    readonly maxReopenCount: number;
  };
}

/** A page of the API's `data` array plus its `meta`. */
export interface PageBody<T> {
  readonly data: readonly T[];
  readonly meta: {
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  };
}

export interface DataBody<T> {
  readonly data: T;
}

export interface TicketCreateInput {
  readonly title: string;
  readonly description?: string;
  readonly category?: string;
  readonly urgency?: TicketUrgency;
  readonly attachmentId?: string;
}

export interface TicketTransitionInput {
  readonly assigneeId?: string;
  readonly assigneeName?: string;
  readonly resolution?: string;
  readonly reason?: string;
  readonly version?: number;
  readonly requestId?: string;
}

/** A read request with the loading/error/reload lifecycle every page here needs. */
export interface RequestState<T> {
  readonly data?: T;
  readonly error?: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

function searchOf(query?: TicketQuery): string {
  if (!query) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    search.append(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * Reads one `/api/tickets` path.
 *
 * `query` is folded into the request key, so a change of filters refetches. `enabled` keeps an optional panel — the
 * dashboard an employee may not read — from issuing a request that is known to be refused.
 */
export function useTicketRequest<T>(
  path: string,
  query?: TicketQuery,
  enabled = true,
): RequestState<T> {
  const api = useApiClient();
  const [revision, setRevision] = useState(0);
  const search = searchOf(query);
  const key = `${path}${search}#${revision}`;
  // The result carries the key it belongs to, so a change of filters reads as loading without an effect writing state.
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: unknown;
  }>();

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void api.request<T>({ path: `${path}${search}` }).then(
      (data) => {
        if (active) setResult({ key, data });
      },
      (error: unknown) => {
        if (active) setResult({ key, error });
      },
    );
    return () => {
      active = false;
    };
  }, [api, enabled, key, path, search]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  if (!enabled) return { loading: false, reload };
  if (result?.key !== key) return { loading: true, reload };
  return { data: result.data, error: result.error, loading: false, reload };
}

/** Whether an error is the API refusing the caller, as opposed to a failure worth retrying. */
export function isDenied(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.status === 401 || error.status === 403)
  );
}

/** A human-readable message for an API failure, preferring the server's own wording. */
export function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return error instanceof Error ? error.message : undefined;
}
