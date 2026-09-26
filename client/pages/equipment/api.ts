import type { ApiClient } from '@nocobase/app-client';

import type {
  BorrowPayload,
  BorrowRecord,
  Equipment,
  EquipmentPayload,
} from './types.js';

/** Envelope shared by every equipment endpoint. */
interface ApiEnvelope<T> {
  readonly data: T;
}

/** `GET /api/equipment` — every equipment record, ordered by asset code. */
export async function listEquipment(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<Equipment[]> {
  const { data } = await api.request<ApiEnvelope<Equipment[]>>({
    path: 'equipment',
    signal,
  });
  return data;
}

/** `GET /api/equipment/:id` — one equipment record. */
export async function getEquipment(
  api: ApiClient,
  id: number | string,
  signal?: AbortSignal,
): Promise<Equipment> {
  const { data } = await api.request<ApiEnvelope<Equipment>>({
    path: `equipment/${encodeURIComponent(String(id))}`,
    signal,
  });
  return data;
}

/** `POST /api/equipment` — create an equipment record. */
export async function createEquipment(
  api: ApiClient,
  payload: EquipmentPayload,
): Promise<Equipment> {
  const { data } = await api.request<ApiEnvelope<Equipment>>({
    path: 'equipment',
    method: 'POST',
    json: payload,
  });
  return data;
}

/** `PATCH /api/equipment/:id` — update an equipment record. */
export async function updateEquipment(
  api: ApiClient,
  id: number,
  payload: EquipmentPayload,
): Promise<Equipment> {
  const { data } = await api.request<ApiEnvelope<Equipment>>({
    path: `equipment/${id}`,
    method: 'PATCH',
    json: payload,
  });
  return data;
}

/** `GET /api/borrow-records` — every borrow record, most recent first. */
export async function listBorrowRecords(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<BorrowRecord[]> {
  const { data } = await api.request<ApiEnvelope<BorrowRecord[]>>({
    path: 'borrow-records',
    signal,
  });
  return data;
}

/** `POST /api/borrow-records` — borrow one available piece of equipment. */
export async function createBorrowRecord(
  api: ApiClient,
  payload: BorrowPayload,
): Promise<BorrowRecord> {
  const { data } = await api.request<ApiEnvelope<BorrowRecord>>({
    path: 'borrow-records',
    method: 'POST',
    json: payload,
  });
  return data;
}

/**
 * `POST /api/borrow-records/:id/return` — record the return. The endpoint is idempotent: returning an already
 * returned record answers with the existing record, so a repeated click never creates a second record.
 */
export async function returnBorrowRecord(
  api: ApiClient,
  id: number,
): Promise<BorrowRecord> {
  const { data } = await api.request<ApiEnvelope<BorrowRecord>>({
    path: `borrow-records/${id}/return`,
    method: 'POST',
  });
  return data;
}
