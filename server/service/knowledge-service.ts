import type { DatabaseManager, FilterNode } from '@nocobase/db';
import type { AuthorizationContext } from '@nocobase/authorization/core';

import { resolvePolicy, scopedRepository } from './authorization-helper.js';

export interface KnowledgeArticle {
  id: number;
  title: string;
  body: string | null;
  status: string;
  updatedAt: string | null;
}

export interface KnowledgeInput {
  title?: unknown;
  body?: unknown;
  status?: unknown;
}

export class ServiceKnowledgeError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
    this.name = 'ServiceKnowledgeError';
  }
}

/** Repair knowledge: supervisors maintain, holders of the read action browse. */
export class ServiceKnowledgeService {
  constructor(private readonly database: DatabaseManager) {}

  async list(
    context: AuthorizationContext,
    search?: string,
  ): Promise<KnowledgeArticle[]> {
    const resolved = await resolvePolicy(
      context,
      'service.knowledge',
      'read',
      'knowledgeArticles',
    );
    if (resolved.effect === 'deny') {
      return [];
    }
    const conditions: FilterNode[] = [];
    if (search) {
      conditions.push({
        kind: 'condition',
        path: ['title'],
        operator: '$includes',
        value: search,
        mode: 'insensitive',
      });
    }
    const rows = (await scopedRepository(
      this.database,
      'knowledgeArticles',
      resolved,
    ).findMany({
      ...(conditions.length > 0
        ? {
            filter: {
              kind: 'filter' as const,
              version: 1 as const,
              root: {
                kind: 'group' as const,
                logic: 'and' as const,
                items: conditions,
              },
            },
          }
        : {}),
      sort: {
        kind: 'sort',
        version: 1,
        items: [{ kind: 'field', path: ['updatedAt'], direction: 'desc' }],
      },
      limit: 200,
    })) as unknown as ArticleRow[];
    return rows.map((row) => ({
      id: Number(row.id),
      title: String(row.title),
      body: row.body,
      status: String(row.status),
      updatedAt: toIso(row.updatedAt),
    }));
  }

  async detail(
    context: AuthorizationContext,
    id: number,
  ): Promise<KnowledgeArticle | undefined> {
    const resolved = await resolvePolicy(
      context,
      'service.knowledge',
      'read',
      'knowledgeArticles',
    );
    if (resolved.effect === 'deny') {
      return undefined;
    }
    const row = (await scopedRepository(
      this.database,
      'knowledgeArticles',
      resolved,
    ).findOne({
      filter: { id },
    })) as unknown as ArticleRow | undefined;
    if (!row) {
      return undefined;
    }
    return {
      id: Number(row.id),
      title: String(row.title),
      body: row.body,
      status: String(row.status),
      updatedAt: toIso(row.updatedAt),
    };
  }

  async create(
    context: AuthorizationContext,
    actorId: string,
    input: KnowledgeInput,
  ): Promise<number> {
    const resolved = await resolvePolicy(
      context,
      'service.knowledge',
      'manage',
      'knowledgeArticles',
    );
    if (resolved.effect === 'deny') {
      throw new ServiceKnowledgeError(
        'FORBIDDEN',
        'Not allowed to manage repair knowledge',
      );
    }
    const values = this.normalize(input);
    const now = new Date();
    const created = await scopedRepository(
      this.database,
      'knowledgeArticles',
      resolved,
    ).createOne({
      values: {
        ...values,
        createdById: actorId,
        createdAt: now,
        updatedAt: now,
      } as Record<string, unknown> as never,
    });
    return Number((created.record as { id: number }).id);
  }

  async update(
    context: AuthorizationContext,
    id: number,
    input: KnowledgeInput,
  ): Promise<boolean> {
    const resolved = await resolvePolicy(
      context,
      'service.knowledge',
      'manage',
      'knowledgeArticles',
    );
    if (resolved.effect === 'deny') {
      throw new ServiceKnowledgeError(
        'FORBIDDEN',
        'Not allowed to manage repair knowledge',
      );
    }
    const values = this.normalize(input, true);
    const repository = scopedRepository(
      this.database,
      'knowledgeArticles',
      resolved,
    );
    const existing = await repository.findOne({ filter: { id } });
    if (!existing) {
      throw new ServiceKnowledgeError(
        'NOT_FOUND',
        'Knowledge article not found',
      );
    }
    await repository.updateOne({
      filter: { id },
      values: { ...values, updatedAt: new Date() } as Record<
        string,
        unknown
      > as never,
    });
    return true;
  }

  private normalize(
    input: KnowledgeInput,
    partial = false,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    if (!partial || input.title !== undefined) {
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title) {
        throw new ServiceKnowledgeError('INVALID_INPUT', 'Title is required');
      }
      values.title = title;
    }
    if (input.body !== undefined) {
      values.body = typeof input.body === 'string' ? input.body : null;
    } else if (!partial) {
      values.body = null;
    }
    if (input.status !== undefined) {
      const status = typeof input.status === 'string' ? input.status : '';
      if (status !== 'draft' && status !== 'published') {
        throw new ServiceKnowledgeError(
          'INVALID_INPUT',
          'Status must be draft or published',
        );
      }
      values.status = status;
    } else if (!partial) {
      values.status = 'draft';
    }
    return values;
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

interface ArticleRow {
  id: number;
  title: string;
  body: string | null;
  status: string;
  updatedAt: Date | string | null;
}
