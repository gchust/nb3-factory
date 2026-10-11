import type { ApiClient } from '@nocobase/app-client';

/** One document as the list, detail drawer and form read it. */
export interface DocumentItem {
  readonly id: number;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Whether the caller's own grant allows editing this record. */
  readonly canEdit: boolean;
  /** Whether the caller's own grant allows deleting this record. */
  readonly canDelete: boolean;
}

export interface DocumentPage {
  readonly data: readonly DocumentItem[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/** One temporary share of one document. */
export interface DocumentShare {
  readonly id: number;
  readonly documentId: number;
  readonly userId: string;
  readonly userName: string | null;
  readonly createdAt: string;
}

export interface ListDocumentsInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly q?: string;
  readonly sortBy?: 'title' | 'updatedAt';
  readonly sortOrder?: 'asc' | 'desc';
  readonly signal?: AbortSignal;
}

/** The fields a create or edit request may carry. */
export interface DocumentInput {
  readonly title?: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

/**
 * The document library's endpoints, kept in one place so a page never spells an API path.
 *
 * Every call goes through the application's API client, which owns the mount path, the session cookie and error
 * mapping. The record access on the server is what decides what comes back; these methods do not filter.
 */
export class DocumentsClient {
  constructor(private readonly api: ApiClient) {}

  list(input: ListDocumentsInput = {}): Promise<DocumentPage> {
    return this.api.request<DocumentPage>({
      path: 'documents',
      query: {
        page: input.page,
        pageSize: input.pageSize,
        q: input.q || undefined,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
      },
      signal: input.signal,
    });
  }

  async get(id: number, signal?: AbortSignal): Promise<DocumentItem> {
    const { data } = await this.api.request<{ data: DocumentItem }>({
      path: `documents/${id}`,
      signal,
    });
    return data;
  }

  async create(input: DocumentInput): Promise<DocumentItem> {
    const { data } = await this.api.request<{ data: DocumentItem }>({
      path: 'documents',
      method: 'POST',
      json: input,
    });
    return data;
  }

  async update(id: number, input: DocumentInput): Promise<DocumentItem> {
    const { data } = await this.api.request<{ data: DocumentItem }>({
      path: `documents/${id}`,
      method: 'PATCH',
      json: input,
    });
    return data;
  }

  async remove(id: number): Promise<void> {
    await this.api.request({
      path: `documents/${id}`,
      method: 'DELETE',
    });
  }

  async listShares(
    id: number,
    signal?: AbortSignal,
  ): Promise<readonly DocumentShare[]> {
    const { data } = await this.api.request<{
      data: readonly DocumentShare[];
    }>({ path: `documents/${id}/shares`, signal });
    return data;
  }

  async share(id: number, userId: string): Promise<DocumentShare> {
    const { data } = await this.api.request<{ data: DocumentShare }>({
      path: `documents/${id}/shares`,
      method: 'POST',
      json: { userId },
    });
    return data;
  }

  async revokeShare(id: number, userId: string): Promise<void> {
    await this.api.request({
      path: `documents/${id}/shares/${encodeURIComponent(userId)}`,
      method: 'DELETE',
    });
  }
}
