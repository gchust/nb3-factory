import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { Hono, type Context } from 'hono';

import {
  MaterialsError,
  materialsToken,
  type MaterialAttachmentRecord,
  type MaterialWithAttachments,
} from '../providers/materials.js';

/**
 * The materials API.
 *
 * This is deliberately not a generic Repository route: a material and its attachments are saved together, and the
 * save has to enforce the title rule and the ownership of every attachment. All five operations require a signed-in
 * user, and every one is scoped by that user's id, so a colleague holding a direct link gets a 404 rather than
 * another user's record.
 *
 * Attachment responses carry a `contentUrl` that points at the application-owned, authenticated byte route.
 */
export default defineApiRoutes((app: Application) => {
  const router = new Hono<AuthEnv>();
  const auth = app.container.resolve(authenticationToken);
  const materials = () => app.container.resolve(materialsToken);
  const publicBasePath = (app.publicBasePath ?? '').replace(/\/$/, '');

  const contentUrl = (attachment: MaterialAttachmentRecord): string =>
    `${publicBasePath}/uploads/materials/${encodeURIComponent(attachment.id)}${
      attachment.ext ? `.${encodeURIComponent(attachment.ext)}` : ''
    }`;

  const present = (material: MaterialWithAttachments) => ({
    id: material.id,
    title: material.title,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
    attachments: material.attachments.map((attachment) => ({
      ...attachment,
      contentUrl: contentUrl(attachment),
    })),
  });

  const ownerId = (context: Context<AuthEnv>): string | undefined =>
    context.get('auth')?.user.id;

  const readInput = async (
    context: Context<AuthEnv>,
  ): Promise<{ title: string; attachmentIds: string[] } | undefined> => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return undefined;
    }
    if (!body || typeof body !== 'object') return undefined;
    const record = body as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title : '';
    const attachmentIds = Array.isArray(record.attachmentIds)
      ? record.attachmentIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    return { title, attachmentIds };
  };

  const failure = (context: Context<AuthEnv>, error: unknown): Response => {
    if (error instanceof MaterialsError) {
      return context.json({ code: error.code, message: error.message }, 400);
    }
    console.error('Materials request failed', error);
    return context.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.',
      },
      500,
    );
  };

  const parseId = (value: string): number | undefined => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
  };

  router.get('/materials', auth.required(), async (context) => {
    const owner = ownerId(context);
    if (!owner) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const list = await materials().listOwned(owner);
    return context.json({ data: list.map(present) });
  });

  router.post('/materials', auth.required(), async (context) => {
    const owner = ownerId(context);
    if (!owner) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const input = await readInput(context);
    if (!input) {
      return context.json(
        {
          code: 'INVALID_BODY',
          message: 'A title and attachmentIds are expected.',
        },
        400,
      );
    }
    try {
      const material = await materials().createOwned(owner, input);
      return context.json({ data: present(material) }, 201);
    } catch (error) {
      return failure(context, error);
    }
  });

  router.get('/materials/:id', auth.required(), async (context) => {
    const owner = ownerId(context);
    if (!owner) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const id = parseId(context.req.param('id'));
    if (id === undefined) return context.notFound();
    const material = await materials().getOwned(owner, id);
    if (!material) return context.notFound();
    return context.json({ data: present(material) });
  });

  router.patch('/materials/:id', auth.required(), async (context) => {
    const owner = ownerId(context);
    if (!owner) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const id = parseId(context.req.param('id'));
    if (id === undefined) return context.notFound();
    const input = await readInput(context);
    if (!input) {
      return context.json(
        {
          code: 'INVALID_BODY',
          message: 'A title and attachmentIds are expected.',
        },
        400,
      );
    }
    try {
      const material = await materials().updateOwned(owner, id, input);
      if (!material) return context.notFound();
      return context.json({ data: present(material) });
    } catch (error) {
      return failure(context, error);
    }
  });

  router.delete('/materials/:id', auth.required(), async (context) => {
    const owner = ownerId(context);
    if (!owner) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const id = parseId(context.req.param('id'));
    if (id === undefined) return context.notFound();
    const removed = await materials().deleteOwned(owner, id);
    if (!removed) return context.notFound();
    return context.body(null, 204);
  });

  // `defineApiRoutes` returns a plain `Hono`; mounting the typed router keeps `AuthEnv` on the
  // handlers while the contribution's factory keeps the shape the runtime expects.
  const root = new Hono();
  root.route('/', router);
  return root;
});
