import type { ApiClient } from '@nocobase/app-client';

/**
 * Client access to the internal device-manual knowledge base.
 *
 * The knowledge base itself belongs to the AI Knowledge Base plugin, so this
 * module does not reimplement storage or permissions. It calls the plugin's
 * published HTTP actions (`ai/aiKnowledgeBase`, `ai/aiKnowledgeBaseDocs`)
 * through the application's own API client, which already targets the real
 * mount path and carries the session cookie. The plugin's server half decides
 * who may read or change a document; `canManage` below only decides whether
 * this page shows the maintenance controls.
 */

/** A knowledge base as the plugin's list action returns it. */
export interface KnowledgeBase {
  readonly id: string | number;
  readonly key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly knowledgeBaseType?: string | null;
  readonly enabled?: boolean;
  readonly documentCount?: number | null;
  readonly characterCount?: number | null;
  readonly vectorStoreProvider?: string | null;
  readonly vectorDatabaseKey?: string | null;
  readonly llmService?: string | null;
  readonly embeddingModel?: string | null;
  readonly updatedAt?: string | null;
}

/** One document in a knowledge base, with its real processing status. */
export interface KnowledgeBaseDocument {
  readonly id: string | number;
  readonly knowledgeBaseKey: string;
  readonly key?: string | null;
  readonly title?: string | null;
  readonly filename?: string | null;
  readonly characterCount?: number | null;
  readonly segmentCount?: number | null;
  readonly indexStatus?: string | null;
  readonly segmentStatus?: string | null;
  readonly errorMessage?: string | null;
  readonly segmentErrorMessage?: string | null;
  readonly updatedAt?: string | null;
}

/** Whether the signed-in user may maintain the device-manual knowledge base. */
export interface ManualKnowledgeBaseAccess {
  readonly knowledgeBaseKey: string;
  readonly canManage: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function bool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  return undefined;
}

/**
 * Reads one of the four paged envelopes the plugin's actions may return:
 * an array, `{ data: [...] }`, `{ data: { data: [...] } }` or `{ rows: [...] }`.
 */
function rowsOf(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const data = payload.data;
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data)) {
    if (Array.isArray(data.data)) return data.data.filter(isRecord);
    if (Array.isArray(data.rows)) return data.rows.filter(isRecord);
  }
  if (Array.isArray(payload.rows)) return payload.rows.filter(isRecord);
  return [];
}

function toKnowledgeBase(row: Record<string, unknown>): KnowledgeBase {
  return {
    id: (row.id as string | number) ?? '',
    key: text(row.key) ?? '',
    name: text(row.name) ?? '',
    description: text(row.description) ?? null,
    knowledgeBaseType: text(row.knowledgeBaseType) ?? null,
    enabled: bool(row.enabled),
    documentCount: number(row.documentCount) ?? null,
    characterCount: number(row.characterCount) ?? null,
    vectorStoreProvider: text(row.vectorStoreProvider) ?? null,
    vectorDatabaseKey: text(row.vectorDatabaseKey) ?? null,
    llmService: text(row.llmService) ?? null,
    embeddingModel: text(row.embeddingModel) ?? null,
    updatedAt: text(row.updatedAt) ?? null,
  };
}

function toDocument(row: Record<string, unknown>): KnowledgeBaseDocument {
  return {
    id: (row.id as string | number) ?? '',
    knowledgeBaseKey: text(row.knowledgeBaseKey) ?? '',
    key: text(row.key) ?? null,
    title: text(row.title) ?? null,
    filename: text(row.filename) ?? null,
    characterCount: number(row.characterCount) ?? null,
    segmentCount: number(row.segmentCount) ?? null,
    indexStatus: text(row.indexStatus) ?? null,
    segmentStatus: text(row.segmentStatus) ?? null,
    errorMessage: text(row.errorMessage) ?? null,
    segmentErrorMessage: text(row.segmentErrorMessage) ?? null,
    updatedAt: text(row.updatedAt) ?? null,
  };
}

/** Whether this page may show the maintenance controls. Server still enforces. */
export async function fetchManualKnowledgeBaseAccess(
  api: ApiClient,
): Promise<ManualKnowledgeBaseAccess> {
  const { data } = await api.request<{ data: ManualKnowledgeBaseAccess }>({
    path: 'service/knowledge/manual-knowledge-base',
  });
  return data;
}

/** The device-manual base, or undefined when it has not been provisioned. */
export async function fetchKnowledgeBase(
  api: ApiClient,
  key: string,
): Promise<KnowledgeBase | undefined> {
  const payload = await api.request<unknown>({
    path: 'ai/aiKnowledgeBase:list',
    query: { paginate: false, 'filter[key]': key },
  });
  return rowsOf(payload)
    .map(toKnowledgeBase)
    .find((item) => item.key === key);
}

/** Documents the plugin holds for one knowledge base, with real status. */
export async function fetchKnowledgeBaseDocuments(
  api: ApiClient,
  key: string,
): Promise<KnowledgeBaseDocument[]> {
  const payload = await api.request<unknown>({
    path: 'ai/aiKnowledgeBaseDocs:list',
    query: { paginate: false, 'filter[knowledgeBaseKey]': key },
  });
  return rowsOf(payload).map(toDocument);
}

/** Uploads one document; the plugin queues vectorization and records its result. */
export async function uploadKnowledgeBaseDocument(
  api: ApiClient,
  key: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append('knowledgeBaseKey', key);
  form.append('file', file);
  await api.request({
    path: 'ai/aiKnowledgeBaseDocs:upload',
    method: 'POST',
    query: { knowledgeBaseKey: key },
    body: form,
  });
}

/** Re-runs processing for one document, e.g. after a failed attempt. */
export async function vectorizeKnowledgeBaseDocument(
  api: ApiClient,
  key: string,
  id: string | number,
): Promise<void> {
  await api.request({
    path: 'ai/aiKnowledgeBaseDocs:vectorization',
    method: 'POST',
    query: { knowledgeBaseKey: key, 'id[]': [String(id)] },
  });
}

/** Removes one document and its vectors. */
export async function deleteKnowledgeBaseDocument(
  api: ApiClient,
  id: string | number,
): Promise<void> {
  await api.request({
    path: 'ai/aiKnowledgeBaseDocs:destroy',
    method: 'POST',
    query: { 'filterByTk[]': [String(id)] },
  });
}
