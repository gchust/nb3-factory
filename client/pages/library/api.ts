import { resolveAppUrl, type ApiClient } from '@nocobase/app-client';

export type PreviewKind = 'image' | 'pdf' | 'text' | 'other';
export type BorrowingStatus = 'pending' | 'borrowed' | 'returned' | 'cancelled';
export type Visibility = 'all' | 'restricted';

export interface MaterialFileDto {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly role: string;
  readonly uploaderId: string | null;
  readonly uploaderName: string | null;
  readonly createdAt: string;
  readonly previewKind: PreviewKind;
}

export interface MaterialSummaryDto {
  readonly id: number;
  readonly title: string;
  readonly category: string | null;
  readonly summary: string | null;
  readonly owner: string | null;
  readonly borrowable: boolean;
  readonly totalCopies: number;
  readonly availableCopies: number;
  readonly visibility: Visibility;
  readonly coverFileId: string | null;
  readonly fileCount: number;
  readonly updatedAt: string;
}

export interface MaterialDetailDto extends MaterialSummaryDto {
  readonly files: readonly MaterialFileDto[];
  readonly readers: readonly string[];
  readonly canManage: boolean;
  readonly myActiveBorrowing: BorrowingDto | null;
}

export interface BorrowingDto {
  readonly id: number;
  readonly materialId: number;
  readonly materialTitle: string;
  readonly userId: string;
  readonly borrowerName: string | null;
  readonly status: BorrowingStatus;
  readonly requestedAt: string;
  readonly borrowedAt: string | null;
  readonly returnedAt: string | null;
}

export interface SelectableUserDto {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string | null;
}

export interface MeDto {
  readonly isAdmin: boolean;
  readonly user: { readonly id: string; readonly name: string | null };
}

export interface MaterialFormValues {
  readonly title: string;
  readonly category: string;
  readonly owner: string;
  readonly summary: string;
  readonly borrowable: boolean;
  readonly totalCopies: number;
  readonly visibility: Visibility;
  readonly readers: readonly string[];
}

export interface MaterialListQuery {
  readonly query?: string;
  readonly category?: string;
}

export function loadMe(api: ApiClient): Promise<MeDto> {
  return api
    .request<{ data: MeDto }>({ path: 'library/me' })
    .then((response) => response.data);
}

export function listMaterials(
  api: ApiClient,
  query: MaterialListQuery = {},
): Promise<readonly MaterialSummaryDto[]> {
  return api
    .request<{ data: MaterialSummaryDto[] }>({
      path: 'library/materials',
      query: {
        ...(query.query ? { query: query.query } : {}),
        ...(query.category ? { category: query.category } : {}),
      },
    })
    .then((response) => response.data);
}

export function listCategories(api: ApiClient): Promise<readonly string[]> {
  return api
    .request<{ data: string[] }>({ path: 'library/categories' })
    .then((response) => response.data);
}

export function getMaterial(
  api: ApiClient,
  id: number,
): Promise<MaterialDetailDto> {
  return api
    .request<{ data: MaterialDetailDto }>({ path: `library/materials/${id}` })
    .then((response) => response.data);
}

export function createMaterial(
  api: ApiClient,
  values: MaterialFormValues,
): Promise<MaterialDetailDto> {
  return api
    .request<{ data: MaterialDetailDto }>({
      path: 'library/materials',
      method: 'POST',
      json: values,
    })
    .then((response) => response.data);
}

export function updateMaterial(
  api: ApiClient,
  id: number,
  values: MaterialFormValues,
): Promise<MaterialDetailDto> {
  return api
    .request<{ data: MaterialDetailDto }>({
      path: `library/materials/${id}`,
      method: 'PATCH',
      json: values,
    })
    .then((response) => response.data);
}

export function deleteMaterial(api: ApiClient, id: number): Promise<void> {
  return api.request<void>({
    path: `library/materials/${id}`,
    method: 'DELETE',
  });
}

export function uploadMaterialFiles(
  api: ApiClient,
  id: number,
  files: readonly File[],
  role: 'cover' | 'attachment',
): Promise<readonly MaterialFileDto[]> {
  const body = new FormData();
  for (const file of files) body.append('files', file);
  body.append('role', role);
  return api
    .request<{ data: MaterialFileDto[] }>({
      path: `library/materials/${id}/files`,
      method: 'POST',
      body,
    })
    .then((response) => response.data);
}

export function deleteMaterialFile(
  api: ApiClient,
  id: number,
  fileId: string,
): Promise<void> {
  return api.request<void>({
    path: `library/materials/${id}/files/${encodeURIComponent(fileId)}`,
    method: 'DELETE',
  });
}

export function setMaterialCover(
  api: ApiClient,
  id: number,
  fileId: string,
): Promise<MaterialDetailDto> {
  return api
    .request<{ data: MaterialDetailDto }>({
      path: `library/materials/${id}/files/${encodeURIComponent(fileId)}/cover`,
      method: 'POST',
    })
    .then((response) => response.data);
}

export function listSelectableUsers(
  api: ApiClient,
): Promise<readonly SelectableUserDto[]> {
  return api
    .request<{ data: SelectableUserDto[] }>({ path: 'library/users' })
    .then((response) => response.data);
}

export function requestBorrow(
  api: ApiClient,
  materialId: number,
): Promise<BorrowingDto> {
  return api
    .request<{ data: BorrowingDto }>({
      path: `library/materials/${materialId}/borrowings`,
      method: 'POST',
    })
    .then((response) => response.data);
}

export function cancelBorrow(
  api: ApiClient,
  borrowingId: number,
): Promise<BorrowingDto> {
  return api
    .request<{ data: BorrowingDto }>({
      path: `library/borrowings/${borrowingId}/cancel`,
      method: 'POST',
    })
    .then((response) => response.data);
}

export function listMyBorrowings(
  api: ApiClient,
): Promise<readonly BorrowingDto[]> {
  return api
    .request<{ data: BorrowingDto[] }>({ path: 'library/borrowings/mine' })
    .then((response) => response.data);
}

export function listBorrowings(
  api: ApiClient,
  status?: BorrowingStatus,
): Promise<readonly BorrowingDto[]> {
  return api
    .request<{ data: BorrowingDto[] }>({
      path: 'library/borrowings',
      query: status ? { status } : {},
    })
    .then((response) => response.data);
}

export function confirmBorrow(
  api: ApiClient,
  borrowingId: number,
): Promise<{ data: BorrowingDto; changed: boolean }> {
  return api.request<{ data: BorrowingDto; changed: boolean }>({
    path: `library/borrowings/${borrowingId}/borrow`,
    method: 'POST',
  });
}

export function confirmReturn(
  api: ApiClient,
  borrowingId: number,
): Promise<{ data: BorrowingDto; changed: boolean }> {
  return api.request<{ data: BorrowingDto; changed: boolean }>({
    path: `library/borrowings/${borrowingId}/return`,
    method: 'POST',
  });
}

/** Same-origin content URL, including the deployment base path. */
export function fileContentUrl(fileId: string, download = false): string {
  const suffix = download ? '?download=1' : '';
  return resolveAppUrl(
    `/api/library/files/${encodeURIComponent(fileId)}/content${suffix}`,
  );
}

/** Pulls the server's error code out of an ApiClientError payload when present. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    payload?: { code?: unknown };
  };
  if (typeof candidate.payload?.code === 'string')
    return candidate.payload.code;
  if (typeof candidate.code === 'string') return candidate.code;
  return undefined;
}

export function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { status?: unknown };
  return typeof candidate.status === 'number' ? candidate.status : undefined;
}
