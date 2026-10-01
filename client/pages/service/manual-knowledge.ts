import { knowledgeBaseService } from '@nocobase/app-plugin-ai-knowledge-base/client';

import type { Manual } from './model.js';

/**
 * The internal device-manual knowledge base the application owns.
 *
 * The Manuals page maintains it through the installed AI Knowledge Base
 * capability (`@nocobase/app-plugin-ai-knowledge-base`) instead of a parallel
 * store, so the platform's own processing and retrieval see the same manuals
 * the application shows. This is a page-local helper: only the Manuals page
 * needs the linkage, so it lives beside that page rather than in
 * `client/components/`.
 */
export const MANUALS_KNOWLEDGE_BASE_KEY = 'service-device-manuals';

const MANUALS_KNOWLEDGE_BASE_NAME = '设备手册 / Device service manuals';

/**
 * References used when the deployment has not configured a real embedding
 * service or vector database. They exist so the knowledge base and its
 * documents are actually created: the supervisor then sees the genuine
 * processing state, and a missing vector service surfaces as the document's
 * real failure reason. The application never reports an indexed manual that
 * was not indexed.
 */
const DECLARED_VECTOR_DATABASE_KEY = 'service-device-manuals-vector';
const DECLARED_LLM_SERVICE = 'service-device-manuals-embedding';
const DECLARED_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * How the knowledge base reports a document. This is the platform's processing
 * state, distinct from the manual's own availability: a manual a supervisor has
 * approved for engineers may still have failed to index for retrieval.
 */
export interface KnowledgeBaseDocumentStatus {
  /** `PENDING`, `SUCCESS` or `ERROR`, as reported by the knowledge base. */
  readonly status: string;
  readonly errorMessage: string | null;
}

export interface ManualDocumentLink {
  readonly knowledgeBaseKey: string;
  readonly documentId: string;
}

const SUPPORTED_MANUAL_EXTENSIONS = /\.(md|txt|json|csv)$/i;

/**
 * Builds the single Markdown file the knowledge base accepts from a manual.
 * The knowledge base validates the lowercase filename extension, so a manual
 * without a usable name is given one rather than being rejected.
 */
export function manualKnowledgeBaseFile(manual: Manual): File {
  const raw = manual.filename?.trim() || `${manual.id}.md`;
  // The knowledge base compares the extension against a lowercase list, so an
  // uppercase or missing extension is normalized rather than rejected.
  const lowered = raw.replace(
    /\.([A-Za-z0-9]+)$/,
    (_match, ext: string) => `.${ext.toLowerCase()}`,
  );
  const filename = SUPPORTED_MANUAL_EXTENSIONS.test(lowered)
    ? lowered
    : `${raw}.md`;
  return new File([manual.content ?? ''], filename, {
    type: 'text/markdown',
  });
}

/** Maps the knowledge base document fields to one honest processing state. */
export function knowledgeBaseStatusOf(document: {
  indexStatus?: string;
  errorMessage?: string | null;
  segmentStatus?: string;
  segmentErrorMessage?: string | null;
}): KnowledgeBaseDocumentStatus {
  const errorMessage =
    document.errorMessage ?? document.segmentErrorMessage ?? null;
  if (document.indexStatus === 'ERROR' || document.segmentStatus === 'ERROR') {
    return { status: 'ERROR', errorMessage };
  }
  const status = document.segmentStatus || document.indexStatus;
  if (status === 'SUCCESS') {
    return { status: 'SUCCESS', errorMessage: null };
  }
  return { status: 'PENDING', errorMessage: null };
}

/**
 * Returns the application's knowledge base, creating it on first use. When the
 * deployment has configured a vector database and embedding service they are
 * used; otherwise the declared references are recorded and the document's real
 * processing error explains what is missing.
 */
export async function ensureManualsKnowledgeBase(): Promise<string> {
  const existing = await knowledgeBaseService.listKnowledgeBases({
    mode: 'all',
  });
  if (existing.rows.some((row) => row.key === MANUALS_KNOWLEDGE_BASE_KEY)) {
    return MANUALS_KNOWLEDGE_BASE_KEY;
  }

  const options =
    await knowledgeBaseService.listKnowledgeBaseManagementOptions();
  const vectorDatabaseKey =
    options.vectorDatabases[0]?.value ?? DECLARED_VECTOR_DATABASE_KEY;
  const llmService = options.llmServices[0]?.value ?? DECLARED_LLM_SERVICE;
  const embeddingModel =
    llmService === DECLARED_LLM_SERVICE
      ? DECLARED_EMBEDDING_MODEL
      : ((await knowledgeBaseService.listEmbeddingModels(llmService))[0]
          ?.value ?? DECLARED_EMBEDDING_MODEL);

  await knowledgeBaseService.createKnowledgeBase({
    key: MANUALS_KNOWLEDGE_BASE_KEY,
    name: MANUALS_KNOWLEDGE_BASE_NAME,
    knowledgeBaseType: 'LOCAL',
    enabled: true,
    vectorDatabaseKey,
    llmService,
    embeddingModel,
    ...(options.storages[0]?.value ? { disk: options.storages[0].value } : {}),
  });
  return MANUALS_KNOWLEDGE_BASE_KEY;
}

/** Uploads one manual as a document and returns the real document link. */
export async function ingestManual(
  manual: Manual,
): Promise<ManualDocumentLink> {
  const knowledgeBaseKey = await ensureManualsKnowledgeBase();
  const uploaded = await knowledgeBaseService.uploadDocument({
    knowledgeBaseKey,
    file: manualKnowledgeBaseFile(manual),
  });
  return { knowledgeBaseKey, documentId: String(uploaded.id) };
}

/** Document-id keyed processing state for every document in the base. */
export async function loadKnowledgeBaseStatuses(
  knowledgeBaseKey: string,
): Promise<Record<string, KnowledgeBaseDocumentStatus>> {
  const page = await knowledgeBaseService.listDocuments({
    mode: 'all',
    knowledgeBaseKey,
  });
  const statuses: Record<string, KnowledgeBaseDocumentStatus> = {};
  for (const document of page.rows) {
    statuses[String(document.id)] = knowledgeBaseStatusOf(document);
  }
  return statuses;
}

/** Best-effort status read: a missing base is not a page error. */
export async function loadManualsKnowledgeBaseStatuses(): Promise<
  Record<string, KnowledgeBaseDocumentStatus>
> {
  try {
    return await loadKnowledgeBaseStatuses(MANUALS_KNOWLEDGE_BASE_KEY);
  } catch {
    return {};
  }
}

/** Re-queues processing for a document whose previous run failed. */
export async function reprocessManual(manual: Manual): Promise<void> {
  if (!manual.documentId) {
    await ingestManual(manual);
    return;
  }
  await knowledgeBaseService.vectorizeDocuments({
    knowledgeBaseKey: manual.knowledgeBaseKey ?? MANUALS_KNOWLEDGE_BASE_KEY,
    documentIds: [manual.documentId],
  });
}

/** Removes the knowledge base documents behind deleted manuals. */
export async function deleteManualDocuments(
  documentIds: readonly string[],
): Promise<void> {
  if (!documentIds.length) return;
  await knowledgeBaseService.deleteDocuments({ documentIds: [...documentIds] });
}
