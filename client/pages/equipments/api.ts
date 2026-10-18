import type { ApiClient } from '@nocobase/app-client';
import { ApiClientError } from '@nocobase/app-client';

export const EQUIPMENT_STATUSES = ['available', 'borrowed'] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export interface Equipment {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: EquipmentStatus;
  readonly notes: string | null;
}

export interface EquipmentInput {
  readonly code: string;
  readonly name: string;
  readonly status: EquipmentStatus;
  readonly notes: string | null;
}

export interface EquipmentListQuery {
  readonly status?: EquipmentStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface EquipmentPage {
  readonly rows: readonly Equipment[];
  readonly total: number;
}

interface EquipmentListResponse {
  readonly data: readonly Equipment[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

interface EquipmentResponse {
  readonly data: Equipment;
}

export function isEquipmentStatus(value: string): value is EquipmentStatus {
  return (EQUIPMENT_STATUSES as readonly string[]).includes(value);
}

export async function listEquipments(
  client: ApiClient,
  query: EquipmentListQuery,
  signal?: AbortSignal,
): Promise<EquipmentPage> {
  const response = await client.request<EquipmentListResponse>({
    path: 'equipments',
    method: 'GET',
    query: {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.status ? { status: query.status } : {}),
    },
    ...(signal ? { signal } : {}),
  });
  return { rows: response.data, total: response.meta.total };
}

export async function getEquipment(
  client: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<Equipment> {
  const response = await client.request<EquipmentResponse>({
    path: `equipments/${id}`,
    method: 'GET',
    ...(signal ? { signal } : {}),
  });
  return response.data;
}

export async function createEquipment(
  client: ApiClient,
  input: EquipmentInput,
): Promise<Equipment> {
  const response = await client.request<EquipmentResponse>({
    path: 'equipments',
    method: 'POST',
    json: input,
  });
  return response.data;
}

export async function updateEquipment(
  client: ApiClient,
  id: string,
  input: Partial<EquipmentInput>,
): Promise<Equipment> {
  const response = await client.request<EquipmentResponse>({
    path: `equipments/${id}`,
    method: 'PATCH',
    json: input,
  });
  return response.data;
}

export function isEquipmentCodeTaken(error: unknown): boolean {
  return (
    error instanceof ApiClientError && error.reason === 'EQUIPMENT_CODE_TAKEN'
  );
}

/**
 * Maps a failed request to the only copy the interface may show. The server's `message` stays a developer
 * diagnostic: its stable `reason` and HTTP status choose a translated sentence instead.
 */
export function equipmentErrorMessageKey(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'equipment.errors.sessionExpired';
    if (error.reason === 'EQUIPMENT_CODE_TAKEN') {
      return 'equipment.errors.codeTaken';
    }
    if (error.status === 404) return 'equipment.errors.notFound';
    if (error.status === 400) return 'equipment.errors.invalidInput';
  }
  return 'equipment.errors.generic';
}
