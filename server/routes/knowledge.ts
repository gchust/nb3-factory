import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serviceKnowledgeServiceToken } from '../providers/tokens.js';
import type { ServiceKnowledgeService } from '../providers/knowledge-service.js';
import {
  authorizeAction,
  errorCode,
  jsonBody,
  numericParam,
  nowIso,
  optionalText,
  queryInteger,
  queryValue,
  requirePolicy,
  type MutationValues,
  type ServiceEnv,
} from './service-shared.js';

const ARTICLE_FIELDS = [
  'title',
  'slug',
  'category',
  'deviceCategory',
  'summary',
  'content',
  'status',
] as const;

const MANUAL_FIELDS = [
  'title',
  'code',
  'deviceCategory',
  'model',
  'version',
  'summary',
  'status',
] as const;

function notFound(): HTTPException {
  return new HTTPException(404, { message: 'Not found' });
}

function conflict(error: unknown): HTTPException | undefined {
  if (errorCode(error) === 'uniqueViolation') {
    return new HTTPException(409, {
      message: 'A record with the same business key already exists',
    });
  }
  return undefined;
}

function stringValues(
  body: Record<string, unknown>,
  fields: readonly string[],
): MutationValues {
  const values: MutationValues = {};
  for (const field of fields) {
    const value = optionalText(body, field);
    if (value !== undefined) values[field] = value;
  }
  return values;
}

/** Knowledge articles, manuals and the shared keyword search. */
export function createKnowledgeRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const knowledge: ServiceKnowledgeService = app.container.resolve(
    serviceKnowledgeServiceToken,
  );
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  /* ---------------------------------------------------------------- articles */

  routes.get('/articles', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.knowledge',
      'view',
    );
    const data = await knowledge.listArticles(
      requirePolicy(policies, 'serviceKnowledgeArticles'),
      {
        query: queryValue(context, 'query'),
        category: queryValue(context, 'category'),
        deviceCategory: queryValue(context, 'deviceCategory'),
        status: queryValue(context, 'status'),
        limit: queryInteger(context, 'limit'),
        offset: queryInteger(context, 'offset'),
      },
    );
    return context.json({ data });
  });

  routes.get('/articles/:id', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.knowledge',
      'view',
    );
    const article = await knowledge.getArticle(
      requirePolicy(policies, 'serviceKnowledgeArticles'),
      numericParam(context),
    );
    if (!article) throw notFound();
    return context.json({ data: article });
  });

  routes.post('/articles', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.knowledge',
      'manage',
    );
    const body = await jsonBody(context);
    const values = stringValues(body, ARTICLE_FIELDS);
    if (
      typeof values.title !== 'string' ||
      typeof values.content !== 'string'
    ) {
      throw new HTTPException(400, {
        message: 'title and content are required',
      });
    }
    if (typeof values.slug !== 'string') {
      values.slug = slugify(String(values.title));
    }
    values.status ??= 'draft';
    values.authorId = context.get('auth')!.user.id;
    const tags = body.tags;
    if (Array.isArray(tags)) {
      values.tags = tags.map((tag) => String(tag));
    }
    values.createdAt = nowIso();
    values.updatedAt = nowIso();
    try {
      const article = await knowledge.createArticle(
        requirePolicy(policies, 'serviceKnowledgeArticles'),
        values,
      );
      return context.json({ data: article }, 201);
    } catch (error) {
      throw conflict(error) ?? error;
    }
  });

  routes.patch('/articles/:id', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.knowledge',
      'manage',
    );
    const body = await jsonBody(context);
    const values = stringValues(body, ARTICLE_FIELDS);
    const tags = body.tags;
    if (Array.isArray(tags)) {
      values.tags = tags.map((tag) => String(tag));
    }
    values.updatedAt = nowIso();
    try {
      const article = await knowledge.updateArticle(
        requirePolicy(policies, 'serviceKnowledgeArticles'),
        numericParam(context),
        values,
      );
      if (!article) throw notFound();
      return context.json({ data: article });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw conflict(error) ?? error;
    }
  });

  /* ----------------------------------------------------------------- manuals */

  routes.get('/manuals', async (context) => {
    const policies = await authorizeAction(context, 'service.manuals', 'view');
    const data = await knowledge.listManuals(
      requirePolicy(policies, 'serviceManuals'),
      {
        query: queryValue(context, 'query'),
        deviceCategory: queryValue(context, 'deviceCategory'),
        status: queryValue(context, 'status'),
        limit: queryInteger(context, 'limit'),
        offset: queryInteger(context, 'offset'),
      },
    );
    return context.json({ data });
  });

  routes.get('/manuals/:id', async (context) => {
    const policies = await authorizeAction(context, 'service.manuals', 'view');
    const manual = await knowledge.getManual(
      requirePolicy(policies, 'serviceManuals'),
      numericParam(context),
    );
    if (!manual) throw notFound();
    return context.json({ data: manual });
  });

  routes.post('/manuals', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.manuals',
      'manage',
    );
    const body = await jsonBody(context);
    const values = stringValues(body, MANUAL_FIELDS);
    if (typeof values.title !== 'string') {
      throw new HTTPException(400, { message: 'title is required' });
    }
    if (typeof values.code !== 'string') {
      values.code = `MAN-${Date.now().toString(36).toUpperCase()}`;
    }
    values.status ??= 'published';
    values.indexStatus = 'not_indexed';
    const fileId = optionalText(body, 'fileId', 64);
    if (fileId !== undefined) values.fileId = fileId;
    values.createdAt = nowIso();
    values.updatedAt = nowIso();
    try {
      const manual = await knowledge.createManual(
        requirePolicy(policies, 'serviceManuals'),
        values,
      );
      return context.json({ data: manual }, 201);
    } catch (error) {
      throw conflict(error) ?? error;
    }
  });

  routes.patch('/manuals/:id', async (context) => {
    const policies = await authorizeAction(
      context,
      'service.manuals',
      'manage',
    );
    const body = await jsonBody(context);
    const values = stringValues(body, MANUAL_FIELDS);
    const fileId = optionalText(body, 'fileId', 64);
    if (fileId !== undefined) values.fileId = fileId;
    values.updatedAt = nowIso();
    try {
      const manual = await knowledge.updateManual(
        requirePolicy(policies, 'serviceManuals'),
        numericParam(context),
        values,
      );
      if (!manual) throw notFound();
      return context.json({ data: manual });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw conflict(error) ?? error;
    }
  });

  /* ------------------------------------------------------------------ search */

  routes.get('/search', async (context) => {
    // Both published-knowledge scopes are required, because the search reads
    // across both tables. Every reader role holds them.
    await authorizeAction(context, 'service.knowledge', 'view');
    await authorizeAction(context, 'service.manuals', 'view');
    const term = queryValue(context, 'query') ?? queryValue(context, 'q') ?? '';
    if (term.trim().length === 0) {
      return context.json({ data: [] });
    }
    const data = await knowledge.search(term, {
      limit: queryInteger(context, 'limit'),
    });
    return context.json({ data });
  });

  return routes;
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'article'}-${Date.now().toString(36)}`;
}
