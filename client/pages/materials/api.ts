import { resolveAppUrl } from '@nocobase/app-client';

/**
 * The `/api/materials` client. Every call is answered by the route's own
 * authorization check, so a request that the current user may not make comes
 * back as a 403 or a 404 and is surfaced as a `MaterialsApiError`.
 */

export interface MaterialDto {
  id: number;
  title: string;
  content: string;
  /** Only returned to identities whose policy reads this column. */
  confidential?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialValues {
  title: string;
  content: string;
}

export class MaterialsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MaterialsApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveAppUrl(path), {
    ...init,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let code = 'REQUEST_FAILED';
    let message = `Request failed with status ${response.status}.`;
    try {
      const payload = (await response.json()) as {
        code?: string;
        message?: string;
      };
      code = payload.code ?? code;
      message = payload.message ?? message;
    } catch {
      // A non-JSON error body keeps the status-based message.
    }
    throw new MaterialsApiError(response.status, code, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function listMaterials(): Promise<MaterialDto[]> {
  const payload = await request<{ data: MaterialDto[] }>('/api/materials');
  return payload.data;
}

export async function createMaterial(
  values: MaterialValues,
): Promise<MaterialDto> {
  const payload = await request<{ data: MaterialDto }>('/api/materials', {
    method: 'POST',
    body: JSON.stringify(values),
  });
  return payload.data;
}

export async function updateMaterial(
  id: number,
  values: MaterialValues,
): Promise<MaterialDto> {
  const payload = await request<{ data: MaterialDto }>(`/api/materials/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  });
  return payload.data;
}

export async function deleteMaterial(id: number): Promise<void> {
  await request<void>(`/api/materials/${id}`, { method: 'DELETE' });
}
