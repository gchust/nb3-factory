import type { ApiClient } from '@nocobase/app-client';

/**
 * The IT repair API contract. The literal resource strings mirror the server
 * declarations in `server/it-repair/declarations.ts`; they are duplicated rather
 * than imported so no server module reaches the browser bundle.
 */
export type TicketCategory = 'computer' | 'account' | 'other';
export type TicketStatus = 'pending' | 'processing' | 'completed';
export const TICKET_CATEGORIES: readonly TicketCategory[] = [
  'computer',
  'account',
  'other',
];
export const TICKET_STATUSES: readonly TicketStatus[] = [
  'pending',
  'processing',
  'completed',
];
export const TICKET_RESOURCE = { type: 'composite', id: 'it.tickets' } as const;

export interface RepairTicket {
  id: number;
  title: string;
  category: TicketCategory;
  description: string | null;
  status: TicketStatus;
  resolution: string | null;
  submittedById: string;
  submittedByName: string;
  handlerId: string | null;
  handlerName: string | null;
  processingAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canStart: boolean;
  canComplete: boolean;
}

export interface TicketCapabilities {
  create: boolean;
  process: boolean;
}

export interface TicketListResult {
  data: RepairTicket[];
  capabilities: TicketCapabilities;
}

export interface CreateTicketInput {
  title: string;
  category: TicketCategory;
  description?: string;
}

const BASE = '/it-repair/tickets';

export async function listTickets(
  api: ApiClient,
  status?: TicketStatus,
): Promise<TicketListResult> {
  return api.request<TicketListResult>({
    path: BASE,
    query: status ? { status } : undefined,
  });
}

export async function createTicket(
  api: ApiClient,
  input: CreateTicketInput,
): Promise<RepairTicket> {
  const result = await api.request<{ data: RepairTicket }>({
    path: BASE,
    method: 'POST',
    json: input,
  });
  return result.data;
}

export async function startTicket(
  api: ApiClient,
  id: number,
): Promise<RepairTicket> {
  const result = await api.request<{ data: RepairTicket }>({
    path: `${BASE}/${id}/start`,
    method: 'POST',
  });
  return result.data;
}

export async function completeTicket(
  api: ApiClient,
  id: number,
  resolution: string,
): Promise<RepairTicket> {
  const result = await api.request<{ data: RepairTicket }>({
    path: `${BASE}/${id}/complete`,
    method: 'POST',
    json: { resolution },
  });
  return result.data;
}
