import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState } from 'react';

export const TICKET_CATEGORIES = [
  'account',
  'hardware',
  'software',
  'network',
  'other',
] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_STATES = [
  'pending',
  'processing',
  'escalated',
  'resolved',
  'closed',
  'cancelled',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketState = (typeof TICKET_STATES)[number];

export interface Ticket {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketState;
  requesterId: string;
  assigneeId: string | null;
  resolution: string | null;
  closeNote: string | null;
  cancelReason: string | null;
  statusChangedAt: string;
  lifecycleVersion: number;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface TicketFile {
  id: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: string | number;
  createdAt: string;
  updatedAt: string;
  contentUrl?: string;
}

export interface AvailableTransition {
  name: string;
  title: string;
  to: readonly string[];
  allowed: boolean;
  blockers: readonly { code: string; message: string }[];
}

export interface LifecycleView {
  record: Ticket;
  state: string;
  version: number | null;
  available: readonly AvailableTransition[];
  history: {
    transitions: readonly TransitionEntry[];
    effectRuns: readonly EffectRun[];
  };
}

export interface TransitionEntry {
  id: string;
  transition: string;
  from: string | null;
  to: string;
  actorId: string;
  input: Readonly<Record<string, unknown>>;
  at: string;
  version: number;
}

export interface EffectRun {
  id: string;
  transitionId: string;
  effect: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends Ticket {
  comments: TicketComment[];
  attachments: readonly {
    id: string;
    ticketId: string;
    attachmentId: string;
    createdAt: string;
  }[];
  files: TicketFile[];
  lifecycle: LifecycleView;
}

export interface Engineer {
  id: string;
  name: string;
}

export interface TicketDashboard {
  summary: {
    total: number;
    active: number;
    pending: number;
    processing: number;
    escalated: number;
    resolved: number;
    closed: number;
    cancelled: number;
    unassigned: number;
    overdue: number;
  };
  unassigned: Ticket[];
  overdue: Ticket[];
  workload: {
    id: string;
    name: string;
    active: number;
    escalated: number;
  }[];
}

export function useTicketsApi<T>(path: string | null) {
  const api = useApiClient();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    path: string | null;
    revision: number;
    data?: T;
    error?: unknown;
    loading: boolean;
  }>({ path, revision: -1, loading: true });

  useEffect(() => {
    if (!path) return;
    let active = true;
    void api.request<T>({ path }).then(
      (body) => {
        // Keep the response envelope: list endpoints carry `meta` beside
        // `data`, and every caller reads the ticket payload from `data.data`.
        if (active) setResult({ path, revision, data: body, loading: false });
      },
      (error: unknown) => {
        if (active) setResult({ path, revision, error, loading: false });
      },
    );
    return () => {
      active = false;
    };
  }, [api, path, revision]);

  return {
    data: result.path === path ? result.data : undefined,
    error: result.path === path ? result.error : undefined,
    loading:
      path !== null && (result.path !== path || result.revision !== revision),
    reload: useCallback(() => setRevision((value) => value + 1), []),
  };
}

export function useTicketPermission(action: string) {
  return useCan({
    resource: { type: 'composite', id: 'helpdesk.tickets' },
    action,
  }).can;
}

export function useTicketLabels() {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const formatDate = (value: string | null | undefined): string =>
    value ? date.format(new Date(value)) : '—';
  return {
    t,
    formatDate,
    category: (value: TicketCategory): string =>
      t(`helpdesk.category.${value}`),
    priority: (value: TicketPriority): string =>
      t(`helpdesk.priority.${value}`),
    status: (value: TicketState): string => t(`helpdesk.status.${value}`),
    action: (value: string): string => t(`helpdesk.action.${value}`),
    transition: (value: string): string =>
      t(`helpdesk.action.${value}`, { defaultValue: value }),
    state: (value: string): string =>
      t(`helpdesk.status.${value}`, { defaultValue: value }),
  };
}

export function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    const payload = error.payload as
      { error?: { localizedMessage?: { message?: unknown } } } | undefined;
    const localized = payload?.error?.localizedMessage?.message;
    // `message` on the client error is for developers and must never reach the
    // person using the page.
    return typeof localized === 'string' && localized ? localized : fallback;
  }
  return fallback;
}
