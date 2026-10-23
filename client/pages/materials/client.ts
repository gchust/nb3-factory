import type { ApiClient } from '@nocobase/app-client';

/** One material as `/api/materials` answers it. */
export interface Material {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What the signed-in person may do, decided by the server from their grants. */
export interface MaterialsCapabilities {
  readonly create: boolean;
  readonly edit: boolean;
  readonly delete: boolean;
  readonly share: boolean;
}

export interface MaterialShare {
  readonly userId: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
}

export interface ShareTarget {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
}

export interface MaterialInput {
  readonly title?: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

/**
 * The materials API. A reader's `list`/`get` already leaves out what they may not
 * read; the server answers `404` for a material the person cannot see, so the page
 * never has to decide visibility itself.
 */
export class MaterialsClient {
  constructor(private readonly api: ApiClient) {}

  async capabilities(): Promise<MaterialsCapabilities> {
    const { data } = await this.api.request<{ data: MaterialsCapabilities }>({
      path: 'materials/capabilities',
    });
    return data;
  }

  async list(): Promise<Material[]> {
    const { data } = await this.api.request<{ data: Material[] }>({
      path: 'materials',
    });
    return data;
  }

  async get(materialId: string): Promise<Material> {
    const { data } = await this.api.request<{ data: Material }>({
      path: `materials/${encodeURIComponent(materialId)}`,
    });
    return data;
  }

  async create(input: MaterialInput): Promise<Material> {
    const { data } = await this.api.request<{ data: Material }>({
      path: 'materials',
      method: 'POST',
      json: input,
    });
    return data;
  }

  async update(materialId: string, input: MaterialInput): Promise<Material> {
    const { data } = await this.api.request<{ data: Material }>({
      path: `materials/${encodeURIComponent(materialId)}`,
      method: 'PATCH',
      json: input,
    });
    return data;
  }

  async remove(materialId: string): Promise<void> {
    await this.api.request({
      path: `materials/${encodeURIComponent(materialId)}`,
      method: 'DELETE',
    });
  }

  async listShares(materialId: string): Promise<MaterialShare[]> {
    const { data } = await this.api.request<{ data: MaterialShare[] }>({
      path: `materials/${encodeURIComponent(materialId)}/shares`,
    });
    return data;
  }

  async shareTargets(materialId: string): Promise<ShareTarget[]> {
    const { data } = await this.api.request<{ data: ShareTarget[] }>({
      path: `materials/${encodeURIComponent(materialId)}/shareTargets`,
    });
    return data;
  }

  async share(materialId: string, userId: string): Promise<void> {
    await this.api.request({
      path: `materials/${encodeURIComponent(materialId)}/shares`,
      method: 'POST',
      json: { userId },
    });
  }

  async revokeShare(materialId: string, userId: string): Promise<void> {
    await this.api.request({
      path: `materials/${encodeURIComponent(materialId)}/shares/${encodeURIComponent(userId)}`,
      method: 'DELETE',
    });
  }
}
