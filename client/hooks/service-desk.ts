/**
 * The client's view of `/api/serviceDesk`: the response types, the request functions, and the small hooks the pages
 * load data with.
 *
 * The pages use `useApiClient` from `@nocobase/app-client` — never `fetch` — so the session cookie, the deployment
 * base path and the standard error body are handled once. The types mirror `server/routes/schemas.ts`; keep them in
 * step with it.
 */
import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** The query-string values `ApiClient.request` takes; `@nocobase/api-client` is not a direct dependency here. */
type ApiQuery = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export type TicketState =
  | 'submitted'
  | 'assigned'
  | 'processing'
  | 'resolved'
  | 'returned'
  | 'closed'
  | 'cancelled';

export type TicketUrgency = 'low' | 'normal' | 'high' | 'urgent';

export const TICKET_STATES = [
  'submitted',
  'assigned',
  'processing',
  'resolved',
  'returned',
  'closed',
  'cancelled',
] as const satisfies readonly TicketState[];

export const TICKET_URGENCIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const satisfies readonly TicketUrgency[];

/** The states that still need somebody's attention, used to decide what the list and overview count as open. */
export const TICKET_OPEN_STATES = [
  'submitted',
  'assigned',
  'processing',
  'returned',
] as const satisfies readonly TicketState[];

export interface ServiceDeskUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface TicketRecord {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly category: string | null;
  readonly location: string | null;
  readonly urgency: TicketUrgency;
  readonly status: TicketState;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly solution: string | null;
  readonly returnReason: string | null;
  readonly attachmentIds: readonly string[] | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TicketListItem extends TicketRecord {
  readonly requesterName: string;
  readonly assigneeName: string | null;
  readonly overdue: boolean;
}

export interface Blocker {
  readonly source: 'state' | 'guard' | 'manual';
  readonly kind: 'permission' | 'precondition';
  readonly code: string;
  readonly message: string;
}

export interface AvailableTransition {
  readonly name: string;
  readonly title: string;
  readonly to: readonly string[];
  readonly allowed: boolean;
  readonly blockers: readonly Blocker[];
}

/** One row of the lifecycle's own log, shown as the ticket's history. */
export interface TicketTransition {
  readonly id: number;
  readonly transition: string;
  readonly from: TicketState | null;
  readonly to: TicketState;
  readonly actorId: string;
  readonly at: string;
  readonly version: number;
}

export interface TicketView {
  readonly record: TicketRecord;
  readonly state: TicketState;
  readonly version: number | null;
  readonly available: readonly AvailableTransition[];
  readonly history: {
    readonly transitions: readonly TicketTransition[];
    readonly effectRuns: readonly unknown[];
  };
  readonly requester: ServiceDeskUser | null;
  readonly assignee: ServiceDeskUser | null;
  readonly overdue: boolean;
}

export interface TicketNote {
  readonly id: number;
  readonly ticketId: number;
  readonly authorId: string;
  readonly kind: 'handling' | 'comment' | 'system';
  readonly content: string;
  readonly createdAt: string;
  readonly authorName: string;
}

export interface ServiceDeskMe {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly helpdesk: boolean;
  readonly engineer: boolean;
}

export interface ServiceDeskOverview {
  readonly me: {
    readonly userId: string;
    readonly helpdesk: boolean;
    readonly engineer: boolean;
  };
  readonly counts: Readonly<Record<TicketState, number>>;
  readonly pendingAssignment: number;
  readonly overdue: number;
  readonly open: number;
  readonly workload: readonly {
    readonly engineerId: string;
    readonly name: string;
    readonly open: number;
    readonly overdue: number;
  }[];
}

export interface StaffMember {
  readonly user: ServiceDeskUser;
  readonly role: 'engineer' | 'helpdesk';
}

export interface TicketListQuery {
  readonly status?: TicketState;
  readonly assigneeId?: string;
  readonly requesterId?: string;
  readonly scope?: 'all' | 'mine' | 'assigned';
  readonly overdue?: boolean;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface TicketListResult {
  readonly records: readonly TicketListItem[];
  readonly total: number;
  /**
   * Whether the request that produced this batch carried filters. It travels with the data so the list can still tell
   * "no tickets yet" from "no matches" right after the filters are cleared, while the old batch is on screen.
   */
  readonly filtered: boolean;
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly category?: string | null;
  readonly location?: string | null;
  readonly urgency: TicketUrgency;
  readonly attachmentIds?: readonly string[];
}

export interface FireTicketAction {
  readonly transition: string;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly expectVersion?: number;
  /** Reused for the retries of one action, so a double submission fires once. */
  readonly requestId?: string;
}

const BASE = 'serviceDesk';

function queryOf(query: TicketListQuery): ApiQuery {
  return {
    status: query.status,
    assigneeId: query.assigneeId,
    requesterId: query.requesterId,
    scope: query.scope,
    overdue: query.overdue === undefined ? undefined : String(query.overdue),
    search: query.search,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function fetchMe(client: ApiClient): Promise<ServiceDeskMe> {
  const { data } = await client.request<{ data: ServiceDeskMe }>({
    path: `${BASE}/me`,
  });
  return data;
}

export async function fetchOverview(
  client: ApiClient,
): Promise<ServiceDeskOverview> {
  const { data } = await client.request<{ data: ServiceDeskOverview }>({
    path: `${BASE}/overview`,
  });
  return data;
}

export async function fetchTickets(
  client: ApiClient,
  query: TicketListQuery,
  signal?: AbortSignal,
): Promise<TicketListResult> {
  const body = await client.request<{
    data: TicketListItem[];
    meta: { total: number };
  }>({ path: `${BASE}/tickets`, query: queryOf(query), signal });
  return {
    records: body.data,
    total: body.meta.total,
    filtered: Boolean(
      query.status ?? query.assigneeId ?? query.requesterId ?? query.overdue,
    ),
  };
}

export async function createTicket(
  client: ApiClient,
  input: CreateTicketInput,
): Promise<TicketView> {
  const { data } = await client.request<
    { data: TicketView },
    CreateTicketInput
  >({ path: `${BASE}/tickets`, method: 'POST', json: input });
  return data;
}

export async function fetchTicket(
  client: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<TicketView> {
  const { data } = await client.request<{ data: TicketView }>({
    path: `${BASE}/tickets/${id}`,
    signal,
  });
  return data;
}

export async function fireTicket(
  client: ApiClient,
  id: number,
  action: FireTicketAction,
): Promise<TicketView> {
  const { data } = await client.request<{ data: TicketView }, FireTicketAction>(
    {
      path: `${BASE}/tickets/${id}/fire`,
      method: 'POST',
      json: action,
    },
  );
  return data;
}

export async function fetchNotes(
  client: ApiClient,
  id: number,
  signal?: AbortSignal,
): Promise<readonly TicketNote[]> {
  const { data } = await client.request<{ data: TicketNote[] }>({
    path: `${BASE}/tickets/${id}/notes`,
    signal,
  });
  return data;
}

export async function addNote(
  client: ApiClient,
  id: number,
  input: { readonly content: string; readonly kind: 'handling' | 'comment' },
): Promise<TicketNote> {
  const { data } = await client.request<{ data: TicketNote }, typeof input>({
    path: `${BASE}/tickets/${id}/notes`,
    method: 'POST',
    json: input,
  });
  return data;
}

export async function fetchEngineers(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<readonly ServiceDeskUser[]> {
  const { data } = await client.request<{ data: ServiceDeskUser[] }>({
    path: `${BASE}/engineers`,
    signal,
  });
  return data;
}

export async function fetchStaff(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<readonly StaffMember[]> {
  const { data } = await client.request<{ data: StaffMember[] }>({
    path: `${BASE}/staff`,
    signal,
  });
  return data;
}

export async function setStaffRole(
  client: ApiClient,
  userId: string,
  role: 'engineer' | 'helpdesk' | null,
): Promise<void> {
  await client.request<unknown, { role: typeof role }>({
    path: `${BASE}/staff/${encodeURIComponent(userId)}`,
    method: 'PUT',
    json: { role },
  });
}

export async function searchDirectory(
  client: ApiClient,
  search: string,
  signal?: AbortSignal,
): Promise<readonly ServiceDeskUser[]> {
  const { data } = await client.request<{ data: ServiceDeskUser[] }>({
    path: `${BASE}/directory`,
    query: { search },
    signal,
  });
  return data;
}

export interface ApiResource<T> {
  readonly data?: T;
  readonly error?: unknown;
  readonly isLoading: boolean;
  readonly reload: () => void;
}

/**
 * One read, keyed by `key`. The key carries everything the request depends on, so a change to it loads again and
 * `isLoading` is derived rather than stored: the state holds the key it belongs to, and anything else is in flight.
 * An empty key means "do not load" — the settings page uses that when the caller is not on the service desk.
 *
 * A reload, or a failed request, keeps the batch already on screen so a refresh does not blank the page; the error of
 * an in-flight request is hidden until it settles.
 */
export function useApiResource<T>(
  key: string,
  load: (client: ApiClient, signal: AbortSignal) => Promise<T>,
): ApiResource<T> {
  const client = useApiClient();
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: unknown;
  }>({ key: '' });

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    loadRef.current(client, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState((previous) => ({ ...previous, key, error }));
        }
      },
    );
    return () => controller.abort();
  }, [client, key, revision]);

  const settled = state.key === key ? state : undefined;
  const isLoading = key !== '' && settled === undefined;
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return {
    data: state.data,
    error: isLoading ? undefined : state.error,
    isLoading,
    reload,
  };
}

/** The caller and their service desk roles; every page reads it first. */
export function useServiceDeskMe(): ApiResource<ServiceDeskMe> {
  return useApiResource('me', (client) => fetchMe(client));
}

export function useServiceDeskOverview(): ApiResource<ServiceDeskOverview> {
  return useApiResource('overview', (client) => fetchOverview(client));
}

export function useTicketList(
  query: TicketListQuery,
  enabled = true,
): ApiResource<TicketListResult> {
  const key = [
    'tickets',
    query.scope ?? '',
    query.status ?? '',
    query.assigneeId ?? '',
    query.requesterId ?? '',
    query.overdue === undefined ? '' : String(query.overdue),
    query.search ?? '',
    query.limit ?? '',
    query.offset ?? '',
  ].join('|');
  return useApiResource(enabled ? key : '', (client, signal) =>
    fetchTickets(client, query, signal),
  );
}

export function useTicket(id: number): ApiResource<TicketView> {
  return useApiResource(id > 0 ? `ticket:${id}` : '', (client, signal) =>
    fetchTicket(client, id, signal),
  );
}

export function useTicketNotes(id: number): ApiResource<readonly TicketNote[]> {
  return useApiResource(id > 0 ? `ticket-notes:${id}` : '', (client, signal) =>
    fetchNotes(client, id, signal),
  );
}

export function useEngineers(
  enabled = true,
): ApiResource<readonly ServiceDeskUser[]> {
  return useApiResource(enabled ? 'engineers' : '', (client, signal) =>
    fetchEngineers(client, signal),
  );
}

export function useStaff(enabled = true): ApiResource<readonly StaffMember[]> {
  return useApiResource(enabled ? 'staff' : '', (client, signal) =>
    fetchStaff(client, signal),
  );
}

export function useDirectory(
  search: string,
  enabled = true,
): ApiResource<readonly ServiceDeskUser[]> {
  return useApiResource(
    enabled ? `directory:${search}` : '',
    (client, signal) => searchDirectory(client, search, signal),
  );
}
