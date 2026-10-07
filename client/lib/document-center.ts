import type { ApiClient } from '@nocobase/app-client';
import { ApiClientError } from '@nocobase/app-client';

/**
 * The Document Center client API: the types the endpoints answer with and one
 * function per endpoint. Both the employee page and the administration console
 * read from here, so a change to the contract is made in one place.
 *
 * Requests go through the application's HTTP client; nothing here builds a URL
 * or a header itself.
 */

export type DocumentCategory = 'handbook' | 'policy' | 'template';
export type DocumentStatus = 'draft' | 'published';
export type DocumentVisibility = 'all' | 'departments';
export type DocumentDeletedFilter = 'exclude' | 'include' | 'only';

/**
 * The categories a document can belong to, in the order they are offered. The
 * label of each one is the `documents.category.<value>` translation key.
 */
export const DOCUMENT_CATEGORIES: readonly DocumentCategory[] = [
  'handbook',
  'policy',
  'template',
];

/** The document statuses in the order they are offered. */
export const DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  'draft',
  'published',
];

/** The visibility scopes in the order they are offered. */
export const DOCUMENT_VISIBILITIES: readonly DocumentVisibility[] = [
  'all',
  'departments',
];

export interface DocumentSummary {
  readonly id: number;
  readonly code: string | null;
  readonly title: string;
  readonly category: DocumentCategory;
  readonly summary: string | null;
  readonly status: DocumentStatus;
  readonly visibility: DocumentVisibility;
  readonly version: number;
  readonly deletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly departmentIds: readonly number[];
}

export interface DocumentDetail extends DocumentSummary {
  readonly content: string;
  readonly createdById: string | null;
  readonly updatedById: string | null;
  readonly deletedById: string | null;
}

export interface DocumentVersion {
  readonly id: number;
  readonly documentId: number;
  readonly version: number;
  readonly title: string;
  readonly category: DocumentCategory;
  readonly summary: string | null;
  readonly content: string;
  readonly visibility: DocumentVisibility;
  readonly departmentIds: readonly number[];
  readonly changeNote: string | null;
  readonly createdById: string | null;
  readonly createdByName: string | null;
  readonly createdAt: string;
}

export interface Citation {
  readonly documentId: string;
  readonly title: string;
  readonly version: number;
  readonly heading: string | null;
  readonly snippet: string;
  readonly score: number;
}

export interface Answer {
  readonly hasAnswer: boolean;
  readonly citations: readonly Citation[];
}

export interface Department {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DepartmentMember {
  readonly id: number;
  readonly departmentId: number;
  readonly userId: string;
  readonly primary: boolean;
  readonly createdAt: string;
}

export interface DirectoryUser {
  readonly id: string;
  readonly name: string | null;
  readonly username: string | null;
  readonly email: string | null;
}

export interface Backup {
  readonly id: number;
  readonly title: string;
  readonly documentCount: number;
  readonly versionCount: number;
  readonly createdById: string | null;
  readonly createdAt: string;
}

export type BackupImpactAction =
  'create' | 'update' | 'restore' | 'delete' | 'unchanged';

export interface BackupImpactEntry {
  readonly documentId: number | null;
  readonly title: string;
  readonly code: string | null;
  readonly action: BackupImpactAction;
}

export interface BackupImpact {
  readonly backup: Backup;
  readonly summary: {
    readonly create: number;
    readonly update: number;
    readonly restore: number;
    readonly delete: number;
    readonly unchanged: number;
    readonly total: number;
  };
  readonly documents: readonly BackupImpactEntry[];
}

export interface BackupRestoreResult {
  readonly backupId: number;
  readonly documents: number;
}

export interface DocumentList {
  readonly data: readonly DocumentSummary[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

export interface CreateDocumentValues {
  readonly title: string;
  readonly code?: string | null;
  readonly category: DocumentCategory;
  readonly summary?: string | null;
  readonly content: string;
  readonly status: DocumentStatus;
  readonly visibility: DocumentVisibility;
  readonly departmentIds: readonly number[];
  readonly changeNote?: string | null;
}

export interface UpdateDocumentValues {
  readonly title?: string;
  readonly code?: string | null;
  readonly category?: DocumentCategory;
  readonly summary?: string | null;
  readonly content?: string;
  readonly status?: DocumentStatus;
  readonly visibility?: DocumentVisibility;
  readonly departmentIds?: readonly number[];
  readonly changeNote?: string | null;
  readonly expectedVersion?: number;
}

export async function listDocuments(
  api: ApiClient,
  query: {
    readonly q?: string;
    readonly category?: DocumentCategory;
    readonly deleted?: DocumentDeletedFilter;
    readonly page?: number;
    readonly pageSize?: number;
  },
  signal?: AbortSignal,
): Promise<DocumentList> {
  return api.request<DocumentList>({
    path: 'documents',
    query: {
      q: query.q,
      category: query.category,
      deleted: query.deleted,
      page: query.page,
      pageSize: query.pageSize,
    },
    signal,
  });
}

export async function getDocument(
  api: ApiClient,
  documentId: number,
  signal?: AbortSignal,
): Promise<DocumentDetail> {
  const { data } = await api.request<{ data: DocumentDetail }>({
    path: `documents/${documentId}`,
    signal,
  });
  return data;
}

export async function listDocumentVersions(
  api: ApiClient,
  documentId: number,
  signal?: AbortSignal,
): Promise<readonly DocumentVersion[]> {
  const { data } = await api.request<{ data: readonly DocumentVersion[] }>({
    path: `documents/${documentId}/versions`,
    signal,
  });
  return data;
}

export async function askQuestion(
  api: ApiClient,
  question: string,
  signal?: AbortSignal,
): Promise<Answer> {
  const { data } = await api.request<{ data: Answer }, { question: string }>({
    path: 'documents/ask',
    method: 'POST',
    json: { question },
    signal,
  });
  return data;
}

export async function createDocument(
  api: ApiClient,
  values: CreateDocumentValues,
): Promise<DocumentDetail> {
  const { data } = await api.request<{ data: DocumentDetail }>({
    path: 'documents',
    method: 'POST',
    json: values,
  });
  return data;
}

export async function updateDocument(
  api: ApiClient,
  documentId: number,
  values: UpdateDocumentValues,
): Promise<DocumentDetail> {
  const { data } = await api.request<{ data: DocumentDetail }>({
    path: `documents/${documentId}`,
    method: 'PATCH',
    json: values,
  });
  return data;
}

export async function deleteDocument(
  api: ApiClient,
  documentId: number,
): Promise<void> {
  await api.request<void>({
    path: `documents/${documentId}`,
    method: 'DELETE',
  });
}

export async function restoreDocument(
  api: ApiClient,
  documentId: number,
): Promise<DocumentSummary> {
  const { data } = await api.request<{ data: DocumentSummary }>({
    path: `documents/${documentId}/restore`,
    method: 'POST',
  });
  return data;
}

export async function restoreDocumentVersion(
  api: ApiClient,
  documentId: number,
  version: number,
  changeNote?: string | null,
): Promise<DocumentDetail> {
  const { data } = await api.request<{ data: DocumentDetail }>({
    path: `documents/${documentId}/versions/${version}/restore`,
    method: 'POST',
    json: { changeNote: changeNote ?? null },
  });
  return data;
}

export async function listDepartments(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<readonly Department[]> {
  const { data } = await api.request<{ data: readonly Department[] }>({
    path: 'departments',
    signal,
  });
  return data;
}

export async function createDepartment(
  api: ApiClient,
  values: {
    readonly code: string;
    readonly title: string;
    readonly description?: string | null;
    readonly active?: boolean;
  },
): Promise<Department> {
  const { data } = await api.request<{ data: Department }>({
    path: 'departments',
    method: 'POST',
    json: values,
  });
  return data;
}

export async function updateDepartment(
  api: ApiClient,
  departmentId: number,
  values: {
    readonly title?: string;
    readonly description?: string | null;
    readonly active?: boolean;
  },
): Promise<Department> {
  const { data } = await api.request<{ data: Department }>({
    path: `departments/${departmentId}`,
    method: 'PATCH',
    json: values,
  });
  return data;
}

export async function listDepartmentMembers(
  api: ApiClient,
  departmentId: number,
  signal?: AbortSignal,
): Promise<readonly DepartmentMember[]> {
  const { data } = await api.request<{ data: readonly DepartmentMember[] }>({
    path: `departments/${departmentId}/members`,
    signal,
  });
  return data;
}

export async function addDepartmentMember(
  api: ApiClient,
  values: { readonly departmentId: number; readonly userId: string },
): Promise<DepartmentMember> {
  const { data } = await api.request<{ data: DepartmentMember }>({
    path: 'departmentMembers',
    method: 'POST',
    json: values,
  });
  return data;
}

export async function removeDepartmentMember(
  api: ApiClient,
  memberId: number,
): Promise<void> {
  await api.request<void>({
    path: `departmentMembers/${memberId}`,
    method: 'DELETE',
  });
}

export async function listDirectoryUsers(
  api: ApiClient,
  query: { readonly q?: string; readonly limit?: number },
  signal?: AbortSignal,
): Promise<readonly DirectoryUser[]> {
  const { data } = await api.request<{ data: readonly DirectoryUser[] }>({
    path: 'directoryUsers',
    query: { q: query.q, limit: query.limit },
    signal,
  });
  return data;
}

export async function listBackups(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<readonly Backup[]> {
  const { data } = await api.request<{ data: readonly Backup[] }>({
    path: 'documentBackups',
    signal,
  });
  return data;
}

export async function createBackup(
  api: ApiClient,
  title?: string,
): Promise<Backup> {
  const { data } = await api.request<{ data: Backup }, { title?: string }>({
    path: 'documentBackups',
    method: 'POST',
    json: title ? { title } : {},
  });
  return data;
}

export async function deleteBackup(
  api: ApiClient,
  backupId: number,
): Promise<void> {
  await api.request<void>({
    path: `documentBackups/${backupId}`,
    method: 'DELETE',
  });
}

export async function getBackupImpact(
  api: ApiClient,
  backupId: number,
  signal?: AbortSignal,
): Promise<BackupImpact> {
  const { data } = await api.request<{ data: BackupImpact }>({
    path: `documentBackups/${backupId}/impact`,
    signal,
  });
  return data;
}

export async function restoreBackup(
  api: ApiClient,
  backupId: number,
): Promise<BackupRestoreResult> {
  const { data } = await api.request<{ data: BackupRestoreResult }>({
    path: `documentBackups/${backupId}/restore`,
    method: 'POST',
    json: { confirm: true },
  });
  return data;
}

/**
 * How a failure should be described to the user, as the suffix of a
 * `documents.error.*` translation key. The server's English `message` is never
 * shown; the reason it reports decides the wording.
 */
export function documentCenterErrorKey(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'requestFailed';
  switch (error.reason) {
    case 'DOCUMENT_NOT_FOUND':
    case 'DEPARTMENT_NOT_FOUND':
    case 'DEPARTMENT_MEMBER_NOT_FOUND':
    case 'BACKUP_NOT_FOUND':
      return 'notFound';
    case 'DOCUMENT_ACCESS_DENIED':
      return 'forbidden';
    case 'DOCUMENT_VERSION_CONFLICT':
      return 'versionConflict';
    case 'DOCUMENT_CODE_TAKEN':
      return 'codeTaken';
    case 'DEPARTMENT_CODE_TAKEN':
      return 'codeTaken';
    case 'DEPARTMENT_MEMBER_EXISTS':
      return 'memberExists';
    case 'DOCUMENT_DEPARTMENTS_REQUIRED':
      return 'departmentsRequired';
    case 'RESTORE_CONFIRMATION_REQUIRED':
      return 'restoreConfirmationRequired';
    default:
      break;
  }
  if (error.status === 401) return 'unauthenticated';
  if (error.status === 403) return 'forbidden';
  if (error.status === 404) return 'notFound';
  if (error.status === 409) return 'conflict';
  return 'requestFailed';
}

/** Human-readable label for the account that made a change, or `null` when it is unknown. */
export function displayUserName(
  user: {
    readonly name: string | null;
    readonly username: string | null;
    readonly email: string | null;
  } | null,
): string | null {
  if (!user) return null;
  return user.name ?? user.username ?? user.email ?? null;
}

/**
 * Downloads a document as a text file. Documents are stored as text, so the
 * file is generated in the browser from the content the endpoint returned:
 * there is no server download endpoint.
 */
export function downloadDocumentFile(file: {
  readonly title: string;
  readonly content: string;
}): void {
  const blob = new Blob([file.content], {
    type: 'text/markdown;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(file.title)}.md`;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(title: string): string {
  const trimmed = title.trim().replace(/[\\/:*?"<>|]+/gu, '_');
  return trimmed || 'document';
}

/** The translation key of a document category's label. */
export function categoryLabelKey(category: DocumentCategory): string {
  return `documents.category.${category}`;
}

/** The translation key of a document status' label. */
export function statusLabelKey(status: DocumentStatus): string {
  return `documents.status.${status}`;
}

/** The translation key of a document visibility's label. */
export function visibilityLabelKey(visibility: DocumentVisibility): string {
  return `documents.visibility.${visibility}`;
}

/** A date and time in the reader's locale, falling back to the raw value. */
export function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
