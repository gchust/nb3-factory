import type { ApiClient } from '@nocobase/app-client';

import type { Material, MaterialInput } from './types.js';

/**
 * The materials HTTP contract, as plain functions over the application's `ApiClient`.
 *
 * Every call goes through `api.request`, which uses the application's configured base path and credentials, so no
 * page hard-codes `/api` or reaches for `fetch`. The endpoints themselves require a session and scope every read
 * and write to the caller, which is why nothing here passes an owner.
 */

interface DataEnvelope<T> {
  readonly data: T;
}

export function listMaterials(api: ApiClient): Promise<readonly Material[]> {
  return api
    .request<DataEnvelope<Material[]>>({ path: '/materials', method: 'GET' })
    .then((response) => response.data);
}

export function getMaterial(
  api: ApiClient,
  id: string,
): Promise<Material | undefined> {
  return api
    .request<DataEnvelope<Material>>({
      path: `/materials/${id}`,
      method: 'GET',
    })
    .then((response) => response.data);
}

export function createMaterial(
  api: ApiClient,
  input: MaterialInput,
): Promise<Material> {
  return api
    .request<DataEnvelope<Material>, MaterialInput>({
      path: '/materials',
      method: 'POST',
      json: input,
    })
    .then((response) => response.data);
}

export function updateMaterial(
  api: ApiClient,
  id: string,
  input: MaterialInput,
): Promise<Material> {
  return api
    .request<DataEnvelope<Material>, MaterialInput>({
      path: `/materials/${id}`,
      method: 'PATCH',
      json: input,
    })
    .then((response) => response.data);
}

export function deleteMaterial(api: ApiClient, id: string): Promise<void> {
  return api
    .request<void>({ path: `/materials/${id}`, method: 'DELETE' })
    .then(() => undefined);
}
