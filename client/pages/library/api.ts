import { ApiClientError, type ApiClient } from '@nocobase/app-client';

/** The library work role: `editor` keeps materials, `reader` only reads what is open to them. */
export type LibraryRole = 'editor' | 'reader';

export interface LibraryActor {
  readonly userId: string;
  readonly isAdmin: boolean;
  readonly role: LibraryRole | null;
}

export interface LibraryMaterial {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly shared: boolean;
  readonly writable: boolean;
  readonly canShare: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LibraryShare {
  readonly userId: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
  readonly createdAt: string;
}

export interface LibraryMember {
  readonly userId: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
  readonly role: LibraryRole | null;
  readonly disabled: boolean;
  readonly isAdmin: boolean;
}

export interface MaterialInput {
  readonly title: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

/**
 * The library's HTTP endpoints, addressed the way every client does: `path` is relative to the API root, so no
 * leading slash and no `/api`, and the deployment base path is never written into a path.
 */
export class LibraryClient {
  constructor(private readonly api: ApiClient) {}

  async actor(): Promise<LibraryActor> {
    return (await this.get<LibraryActor>('library/me')).data;
  }

  async materials(): Promise<LibraryMaterial[]> {
    return (await this.get<LibraryMaterial[]>('library/materials')).data;
  }

  async material(materialId: string): Promise<LibraryMaterial> {
    return (
      await this.get<LibraryMaterial>(
        `library/materials/${encodeURIComponent(materialId)}`,
      )
    ).data;
  }

  async createMaterial(input: MaterialInput): Promise<LibraryMaterial> {
    return (
      await this.api.request<{ data: LibraryMaterial }>({
        path: 'library/materials',
        method: 'POST',
        json: input,
      })
    ).data;
  }

  async updateMaterial(
    materialId: string,
    input: Partial<MaterialInput>,
  ): Promise<LibraryMaterial> {
    return (
      await this.api.request<{ data: LibraryMaterial }>({
        path: `library/materials/${encodeURIComponent(materialId)}`,
        method: 'PATCH',
        json: input,
      })
    ).data;
  }

  async deleteMaterial(materialId: string): Promise<void> {
    await this.api.request({
      path: `library/materials/${encodeURIComponent(materialId)}`,
      method: 'DELETE',
    });
  }

  async shares(materialId: string): Promise<LibraryShare[]> {
    return (
      await this.get<LibraryShare[]>(
        `library/materials/${encodeURIComponent(materialId)}/shares`,
      )
    ).data;
  }

  async share(materialId: string, userId: string): Promise<LibraryShare[]> {
    return (
      await this.api.request<{ data: LibraryShare[] }>({
        path: `library/materials/${encodeURIComponent(materialId)}/shares`,
        method: 'POST',
        json: { userId },
      })
    ).data;
  }

  async unshare(materialId: string, userId: string): Promise<LibraryShare[]> {
    return (
      await this.api.request<{ data: LibraryShare[] }>({
        path: `library/materials/${encodeURIComponent(materialId)}/shares/${encodeURIComponent(userId)}`,
        method: 'DELETE',
      })
    ).data;
  }

  async members(): Promise<LibraryMember[]> {
    return (await this.get<LibraryMember[]>('library/users')).data;
  }

  async setRole(userId: string, role: LibraryRole): Promise<LibraryMember> {
    return (
      await this.api.request<{ data: LibraryMember }>({
        path: `library/users/${encodeURIComponent(userId)}/role`,
        method: 'PUT',
        json: { role },
      })
    ).data;
  }

  /** Disabling is the users plugin's operation, not the library's; the session it revokes is the plugin's too. */
  async disableUser(userId: string): Promise<void> {
    await this.api.request({
      path: `users/${encodeURIComponent(userId)}/disable`,
      method: 'POST',
    });
  }

  async enableUser(userId: string): Promise<void> {
    await this.api.request({
      path: `users/${encodeURIComponent(userId)}/enable`,
      method: 'POST',
    });
  }

  private get<T>(path: string): Promise<{ data: T }> {
    return this.api.request<{ data: T }>({ path });
  }
}

/** True when the request was refused because the session is gone — disabled, signed out or expired. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

/** True when the material is missing or the caller may not see it; the server answers both the same way. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404;
}

/** True when the caller is signed in but not allowed to do this. */
export function isForbidden(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

/** The developer-facing message of an API error, for the places a page has nothing better to show. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
