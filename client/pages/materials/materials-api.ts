import type { ApiClient } from '@nocobase/app-client';

/** One stored material, exactly as the server hands it over. */
export interface Material {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly confidential: boolean;
}

/** The list response: the visible records plus whether this user may edit. */
export interface MaterialList {
  readonly data: readonly Material[];
  readonly meta: { readonly canManage: boolean };
}

/** The only fields the API accepts on a create or an update. */
export interface MaterialInput {
  readonly title: string;
  readonly body: string;
}

/** Every material the signed-in user is allowed to see. */
export async function listMaterials(api: ApiClient): Promise<MaterialList> {
  return api.request<MaterialList>({ method: 'GET', path: '/materials' });
}

/** Create one material. Requires `manage`; the server decides, not the page. */
export async function createMaterial(
  api: ApiClient,
  input: MaterialInput,
): Promise<Material> {
  const response = await api.request<{ data: Material }, MaterialInput>({
    json: input,
    method: 'POST',
    path: '/materials',
  });
  return response.data;
}

/** Rewrite one material's title and body. Requires `manage`. */
export async function updateMaterial(
  api: ApiClient,
  id: number,
  input: MaterialInput,
): Promise<Material> {
  const response = await api.request<{ data: Material }, MaterialInput>({
    json: input,
    method: 'PATCH',
    path: `/materials/${id}`,
  });
  return response.data;
}

/** Remove one material. Requires `manage`. */
export async function deleteMaterial(
  api: ApiClient,
  id: number,
): Promise<void> {
  await api.request({ method: 'DELETE', path: `/materials/${id}` });
}
