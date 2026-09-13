import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  ResourceCenterError,
  resourceCenterServiceToken,
  type ResourceAttachment,
  type ResourceCreateInput,
  type ResourceView,
} from '../providers/resource-center.js';

interface ResourceAttachmentView extends Omit<
  ResourceAttachment,
  'contentPath'
> {
  readonly contentUrl: string;
}

interface ResourceViewResponse extends Omit<
  ResourceView,
  'cover' | 'document'
> {
  readonly cover: ResourceAttachmentView | null;
  readonly document: ResourceAttachmentView | null;
}

export const resourceCenterRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(resourceCenterServiceToken);
    const basePath = app.publicBasePath.replace(/\/$/, '');

    // Every path under /resources belongs to this router and requires a session.
    const resources = new Hono();
    resources.use('*', auth.required());

    resources.get('/', async (context) => {
      const data = await service.list();
      return context.json({
        data: data.map((resource) => toResponse(resource, basePath)),
      });
    });

    resources.post('/', async (context) => {
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json({ code: 'INVALID_BODY' }, 400);
      }

      const parsed = parseCreateInput(body);
      if (!parsed.ok) return context.json({ code: parsed.code }, 400);

      try {
        const resource = await service.create(parsed.value);
        return context.json({ data: toResponse(resource, basePath) }, 201);
      } catch (error) {
        if (error instanceof ResourceCenterError) {
          return context.json({ code: error.code }, 400);
        }
        throw error;
      }
    });

    resources.get('/:id', async (context) => {
      const id = Number(context.req.param('id'));
      if (!Number.isSafeInteger(id) || id <= 0) {
        return context.json({ code: 'INVALID_ID' }, 400);
      }
      const resource = await service.get(id);
      if (!resource) return context.json({ code: 'NOT_FOUND' }, 404);
      return context.json({ data: toResponse(resource, basePath) });
    });

    router.route('/resources', resources);
    return router;
  });

function toResponse(
  resource: ResourceView,
  basePath: string,
): ResourceViewResponse {
  return {
    ...resource,
    cover: resource.cover ? toAttachment(resource.cover, basePath) : null,
    document: resource.document
      ? toAttachment(resource.document, basePath)
      : null,
  };
}

function toAttachment(
  attachment: ResourceAttachment,
  basePath: string,
): ResourceAttachmentView {
  const { contentPath, ...rest } = attachment;
  return { ...rest, contentUrl: `${basePath}${contentPath}` };
}

function parseCreateInput(
  body: unknown,
):
  | { readonly ok: true; readonly value: ResourceCreateInput }
  | { readonly ok: false; readonly code: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, code: 'INVALID_BODY' };
  }
  const record = body as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const category =
    typeof record.category === 'string' ? record.category.trim() : '';
  if (!title || title.length > 200) {
    return { ok: false, code: 'INVALID_TITLE' };
  }
  if (!category || category.length > 100) {
    return { ok: false, code: 'INVALID_CATEGORY' };
  }

  const coverFileId = optionalFileId(record.coverFileId);
  const documentFileId = optionalFileId(record.documentFileId);
  if (coverFileId === undefined || documentFileId === undefined) {
    return { ok: false, code: 'INVALID_FILE_ID' };
  }

  return {
    ok: true,
    value: { title, category, coverFileId, documentFileId },
  };
}

/** `null` or an empty value means no attachment; a non-string is rejected. */
function optionalFileId(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' ? value : undefined;
}
