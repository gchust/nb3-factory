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
 * save has to enforce the title rule and the ownership of every attachment. All operations require a signed-in user,
 * and every one is scoped by that user's id, so a colleague holding a direct link gets a 404 rather than another
 * user's record.
 *
 * Attachment responses carry a `contentUrl` that points at the application-owned, authenticated byte route.
 * `material-content.ts` serves those bytes; the File Repository's own public byte route is never mounted.
 *
 * Two read aliases (`/materials:list` and `/materialFiles:list`) return the same JSON as the REST reads. They exist
 * because a NocoBase 2 convention still probes `<resource>:list`; returning a resource instead of the SPA fallback
 * makes that probe see the feature, and neither alias can read a row the caller does not own.
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

  const presentAttachment = (attachment: MaterialAttachmentRecord) => ({
    ...attachment,
    contentUrl: contentUrl(attachment),
  });

  const present = (material: MaterialWithAttachments) => ({
    id: material.id,
    title: material.title,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
    attachments: material.attachments.map(presentAttachment),
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

  const list = async (context: Context<AuthEnv>): Promise<Response> => {
    const owner = ownerId(context);
    if (!owner) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const rows = await materials().listOwned(owner);
    return context.json({ data: rows.map(present) });
  };

  const listAttachments = async (
    context: Context<AuthEnv>,
  ): Promise<Response> => {
    const owner = ownerId(context);
    if (!owner) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const rows = await materials().listAttachmentsOwned(owner);
    return context.json({ data: rows.map(presentAttachment) });
  };

  const create = async (context: Context<AuthEnv>): Promise<Response> => {
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
  };

  const update = async (context: Context<AuthEnv>): Promise<Response> => {
    const owner = ownerId(context);
    if (!owner) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const id = context.req.param('id');
    if (!id) return context.notFound();
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
  };

  const read = async (context: Context<AuthEnv>): Promise<Response> => {
    const owner = ownerId(context);
    if (!owner) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const id = context.req.param('id');
    if (!id) return context.notFound();
    const material = await materials().getOwned(owner, id);
    if (!material) return context.notFound();
    return context.json({ data: present(material) });
  };

  const remove = async (context: Context<AuthEnv>): Promise<Response> => {
    const owner = ownerId(context);
    if (!owner) return context.json({ code: 'UNAUTHORIZED' }, 401);
    const id = context.req.param('id');
    if (!id) return context.notFound();
    const removed = await materials().deleteOwned(owner, id);
    if (!removed) return context.notFound();
    return context.body(null, 204);
  };

  router.get('/materials', auth.required(), list);
  router.get('/materials:list', auth.required(), list);
  router.get('/materialFiles:list', auth.required(), listAttachments);
  router.post('/materials', auth.required(), create);
  router.get('/materials/:id', auth.required(), read);
  router.patch('/materials/:id', auth.required(), update);
  router.delete('/materials/:id', auth.required(), remove);

  // `defineApiRoutes` returns a plain `Hono`; mounting the typed router keeps `AuthEnv` on the
  // handlers while the contribution's factory keeps the shape the runtime expects.
  const root = new Hono();
  root.route('/', router);
  return root;
});
