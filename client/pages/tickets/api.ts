import type { ApiClient } from '@nocobase/app-client';

import type {
  Engineer,
  Team,
  TeamMember,
  Ticket,
  TicketDashboard,
  TicketListMeta,
  TicketListQuery,
} from './types.js';

/** The API paths, relative to the client's `/api` base URL. */
const base = 'tickets';

export async function getDashboard(api: ApiClient): Promise<TicketDashboard> {
  const result = await api.request<{ data: TicketDashboard }>({
    path: `${base}/dashboard`,
  });
  return result.data;
}

export async function listTickets(
  api: ApiClient,
  query: TicketListQuery,
): Promise<{ items: Ticket[]; meta: TicketListMeta }> {
  const result = await api.request<{
    data: Ticket[];
    meta: TicketListMeta;
  }>({
    path: base,
    query: {
      status: query.status,
      urgency: query.urgency,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    },
  });
  return { items: result.data, meta: result.meta };
}

export async function getTicket(api: ApiClient, id: number): Promise<Ticket> {
  const result = await api.request<{ data: Ticket }>({
    path: `${base}/${id}`,
  });
  return result.data;
}

export interface CreateTicketJson {
  readonly title: string;
  readonly description: string;
  readonly urgency: string;
  readonly attachmentIds?: readonly string[];
}

export async function createTicket(
  api: ApiClient,
  json: CreateTicketJson,
): Promise<Ticket> {
  const result = await api.request<{ data: Ticket }>({
    path: base,
    method: 'POST',
    json,
  });
  return result.data;
}

export async function fireTicket(
  api: ApiClient,
  id: number,
  transition: string,
  input: Record<string, unknown> | undefined,
): Promise<Ticket> {
  const result = await api.request<{ data: Ticket }>({
    path: `${base}/${id}/fire`,
    method: 'POST',
    json: { transition, input },
  });
  return result.data;
}

export async function listEngineers(api: ApiClient): Promise<Engineer[]> {
  const result = await api.request<{ data: Engineer[] }>({
    path: `${base}/engineers`,
  });
  return result.data;
}

export async function getTeam(api: ApiClient): Promise<Team> {
  const result = await api.request<{ data: Team }>({ path: `${base}/team` });
  return result.data;
}

export interface CreateTeamMemberJson {
  readonly name: string;
  readonly username?: string;
  readonly email: string;
  readonly password: string;
  readonly roles?: readonly string[];
}

export async function createTeamMember(
  api: ApiClient,
  json: CreateTeamMemberJson,
): Promise<TeamMember> {
  const result = await api.request<{ data: TeamMember }>({
    path: `${base}/team`,
    method: 'POST',
    json,
  });
  return result.data;
}

export async function setMemberRoles(
  api: ApiClient,
  userId: string,
  roles: readonly string[],
): Promise<TeamMember> {
  const result = await api.request<{ data: TeamMember }>({
    path: `${base}/team/${encodeURIComponent(userId)}/roles`,
    method: 'PUT',
    json: { roles },
  });
  return result.data;
}
