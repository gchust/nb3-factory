import type { FilterBuilder } from '@nocobase/repository-input';

import type { Page, ListQuery } from './catalog.js';
import {
  authorizeCompositeAction,
  scopedRepository,
  type RequestServiceContext,
  type ServiceRuntime,
} from './context.js';
import { notFound } from './errors.js';
import type { DeviceManualRow, RepairKnowledgeRow } from './types.js';

function page<T>(rows: T[], total: number, query: ListQuery): Page<T> {
  return {
    rows,
    total,
    limit: query.limit ?? rows.length,
    offset: query.offset ?? 0,
  };
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '')
      .slice(0, 40) || 'manual'
  );
}

/** The private-disk key a manual's Markdown source is written to. */
export function manualSourceKey(
  manual: Pick<DeviceManualRow, 'fileName'>,
): string {
  return `manuals/${manual.fileName}`;
}

export async function listKnowledge(
  context: RequestServiceContext,
  query: ListQuery & { status?: string; category?: string },
): Promise<Page<RepairKnowledgeRow>> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.knowledge',
    ['view'],
  );
  const knowledge = scopedRepository<RepairKnowledgeRow>(
    context.database,
    'repair_knowledge',
    policies,
  );
  const keyword = query.keyword?.trim();
  const filter = (builder: FilterBuilder) =>
    builder.and([
      ...(query.status ? [builder.string('status').eq(query.status)] : []),
      ...(query.category
        ? [builder.string('category').eq(query.category)]
        : []),
      ...(keyword
        ? [
            builder.or([
              builder
                .string('title')
                .includes(keyword, { mode: 'insensitive' }),
              builder
                .string('content')
                .includes(keyword, { mode: 'insensitive' }),
            ]),
          ]
        : []),
    ]);
  const rows = await knowledge.findMany({
    filter,
    sort: (sort) => [sort.field('updatedAt').desc()],
    limit: query.limit,
    offset: query.offset,
  });
  const total = await knowledge.count({ filter });
  return page(rows, total, query);
}

export async function getKnowledge(
  context: RequestServiceContext,
  id: number,
): Promise<RepairKnowledgeRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.knowledge',
    ['view'],
  );
  const knowledge = scopedRepository<RepairKnowledgeRow>(
    context.database,
    'repair_knowledge',
    policies,
  );
  const entry = await knowledge.findOne({ filter: { id } });
  if (!entry) {
    throw notFound(
      'KNOWLEDGE_NOT_FOUND',
      `Knowledge entry ${id} was not found.`,
    );
  }
  return entry;
}

export async function createKnowledge(
  context: RequestServiceContext,
  input: {
    title: string;
    content: string;
    category?: string | null;
    status?: string;
  },
): Promise<RepairKnowledgeRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.knowledge',
    ['manage'],
  );
  const knowledge = scopedRepository<RepairKnowledgeRow>(
    context.database,
    'repair_knowledge',
    policies,
  );
  const now = new Date().toISOString();
  const status = input.status === 'published' ? 'published' : 'draft';
  const result = await knowledge.createOne({
    values: {
      title: input.title,
      content: input.content,
      category: input.category ?? null,
      status,
      publishedAt: status === 'published' ? now : null,
      authorId: context.actorId,
      createdAt: now,
      updatedAt: now,
    } as never,
  });
  return result.record;
}

export async function updateKnowledge(
  context: RequestServiceContext,
  id: number,
  patch: Partial<RepairKnowledgeRow>,
): Promise<RepairKnowledgeRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.knowledge',
    ['manage'],
  );
  const knowledge = scopedRepository<RepairKnowledgeRow>(
    context.database,
    'repair_knowledge',
    policies,
  );
  const existing = await knowledge.findOne({ filter: { id } });
  if (!existing) {
    throw notFound(
      'KNOWLEDGE_NOT_FOUND',
      `Knowledge entry ${id} was not found.`,
    );
  }
  const now = new Date().toISOString();
  const values: Record<string, unknown> = { updatedAt: now };
  for (const key of ['title', 'content', 'category'] as const) {
    if (patch[key] !== undefined) {
      values[key] = patch[key];
    }
  }
  if (patch.status !== undefined) {
    values.status = patch.status === 'published' ? 'published' : 'draft';
    values.publishedAt =
      patch.status === 'published' ? (existing.publishedAt ?? now) : null;
  }
  const result = await knowledge.updateOne({
    filter: { id },
    values: values as never,
  });
  if (!result.record) {
    throw notFound(
      'KNOWLEDGE_NOT_FOUND',
      `Knowledge entry ${id} was not found.`,
    );
  }
  return result.record;
}

export function publishKnowledge(
  context: RequestServiceContext,
  id: number,
): Promise<RepairKnowledgeRow> {
  return updateKnowledge(context, id, { status: 'published' });
}

export function unpublishKnowledge(
  context: RequestServiceContext,
  id: number,
): Promise<RepairKnowledgeRow> {
  return updateKnowledge(context, id, { status: 'draft' });
}

export async function listManuals(
  context: RequestServiceContext,
  query: ListQuery & { status?: string; deviceId?: number },
): Promise<Page<DeviceManualRow>> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.manuals',
    ['view'],
  );
  const manuals = scopedRepository<DeviceManualRow>(
    context.database,
    'device_manuals',
    policies,
  );
  const keyword = query.keyword?.trim();
  const filter = (builder: FilterBuilder) =>
    builder.and([
      ...(query.status ? [builder.string('status').eq(query.status)] : []),
      ...(query.deviceId !== undefined
        ? [builder.number('deviceId').eq(query.deviceId)]
        : []),
      ...(keyword
        ? [
            builder.or([
              builder
                .string('title')
                .includes(keyword, { mode: 'insensitive' }),
              builder
                .string('fileName')
                .includes(keyword, { mode: 'insensitive' }),
            ]),
          ]
        : []),
    ]);
  const rows = await manuals.findMany({
    filter,
    sort: (sort) => [sort.field('updatedAt').desc()],
    limit: query.limit,
    offset: query.offset,
  });
  const total = await manuals.count({ filter });
  return page(rows, total, query);
}

export async function getManual(
  context: RequestServiceContext,
  id: number,
): Promise<DeviceManualRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.manuals',
    ['view'],
  );
  const manuals = scopedRepository<DeviceManualRow>(
    context.database,
    'device_manuals',
    policies,
  );
  const manual = await manuals.findOne({ filter: { id } });
  if (!manual) {
    throw notFound('MANUAL_NOT_FOUND', `Device manual ${id} was not found.`);
  }
  return manual;
}

/** Writes a manual's Markdown source to the private disk the knowledge base reads. */
async function writeManualSource(
  runtime: ServiceRuntime,
  manual: Pick<DeviceManualRow, 'fileName'> & {
    title: string;
    content: string;
  },
): Promise<void> {
  if (!runtime.drive) {
    return;
  }
  await runtime.drive.use('local').put(manualSourceKey(manual), manual.content);
}

export async function createManual(
  context: RequestServiceContext,
  input: {
    title: string;
    content: string;
    deviceId?: number | null;
  },
): Promise<DeviceManualRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.manuals',
    ['manage'],
  );
  const manuals = scopedRepository<DeviceManualRow>(
    context.database,
    'device_manuals',
    policies,
  );
  const now = new Date().toISOString();
  const fileName = `${slugify(input.title)}.md`;
  await writeManualSource(context, {
    fileName,
    title: input.title,
    content: input.content,
  });
  const result = await manuals.createOne({
    values: {
      title: input.title,
      fileName,
      content: input.content,
      deviceId: input.deviceId ?? null,
      status: 'uploaded',
      failureReason: null,
      aiDocumentId: null,
      uploadedById: context.actorId,
      createdAt: now,
      updatedAt: now,
    } as never,
  });
  return result.record;
}

export async function updateManual(
  context: RequestServiceContext,
  id: number,
  patch: Partial<DeviceManualRow>,
): Promise<DeviceManualRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.manuals',
    ['manage'],
  );
  const manuals = scopedRepository<DeviceManualRow>(
    context.database,
    'device_manuals',
    policies,
  );
  const existing = await manuals.findOne({ filter: { id } });
  if (!existing) {
    throw notFound('MANUAL_NOT_FOUND', `Device manual ${id} was not found.`);
  }
  const next = {
    fileName: patch.fileName ?? existing.fileName,
    title: patch.title ?? existing.title,
    content: patch.content ?? existing.content,
  };
  if (patch.content !== undefined || patch.fileName !== undefined) {
    await writeManualSource(context, next);
  }
  const now = new Date().toISOString();
  const values: Record<string, unknown> = { updatedAt: now };
  for (const key of ['title', 'fileName', 'content', 'deviceId'] as const) {
    if (patch[key] !== undefined) {
      values[key] = patch[key];
    }
  }
  if (patch.content !== undefined || patch.title !== undefined) {
    // Re-indexing is the caller's decision; a content change resets the state.
    values.status = 'uploaded';
    values.failureReason = null;
  }
  const result = await manuals.updateOne({
    filter: { id },
    values: values as never,
  });
  if (!result.record) {
    throw notFound('MANUAL_NOT_FOUND', `Device manual ${id} was not found.`);
  }
  return result.record;
}

/**
 * Records what the knowledge-base ingestion actually reported.
 *
 * Called with the real outcome so the manual page shows `ready` only when the
 * document was accepted and indexed, and shows the real failure reason
 * otherwise. Nothing here assumes success.
 */
export async function recordManualIndexOutcome(
  runtime: ServiceRuntime,
  id: number,
  outcome: {
    status: 'ready' | 'processing' | 'failed';
    detail: string;
    aiDocumentId?: string | null;
  },
): Promise<DeviceManualRow> {
  const manuals =
    runtime.database.repository<DeviceManualRow>('device_manuals');
  const now = new Date().toISOString();
  const result = await manuals.updateOne({
    filter: { id },
    values: {
      status: outcome.status,
      failureReason: outcome.status === 'failed' ? outcome.detail : null,
      aiDocumentId: outcome.aiDocumentId ?? null,
      updatedAt: now,
    } as never,
  });
  if (!result.record) {
    throw notFound('MANUAL_NOT_FOUND', `Device manual ${id} was not found.`);
  }
  return result.record;
}
