import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  accessServiceToken,
  knowledgeServiceToken,
} from '../services/contracts.js';
import { DEVICE_MANUAL_KNOWLEDGE_BASE_KEY } from '../ai/manuals/manuals.js';
import {
  asString,
  asText,
  readJsonBody,
  requireActor,
  route,
  toBoolean,
} from './helpers.js';

/** Knowledge articles (drafts supervisor-only) and the shipped device manuals. */
export function createKnowledgeRouter(app: Application): Hono {
  const router = new Hono();
  const knowledge = () => app.container.resolve(knowledgeServiceToken);
  const access = () => app.container.resolve(accessServiceToken);

  router.get(
    '/knowledge/articles',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const items = await knowledge().listArticles(actor, {
        published: toBoolean(context.req.query('published')),
        keyword: context.req.query('keyword') || undefined,
      });
      return context.json({ data: items });
    }),
  );

  router.post(
    '/knowledge/articles',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const created = await knowledge().createArticle(actor, {
        title: asText(body.title),
        body: asString(body.body),
        category: asString(body.category),
        published: toBoolean(body.published),
      });
      return context.json({ data: created }, 201);
    }),
  );

  router.get(
    '/knowledge/articles/:id',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const article = await knowledge().getArticle(
        actor,
        Number(context.req.param('id')),
      );
      return context.json({ data: article });
    }),
  );

  router.patch(
    '/knowledge/articles/:id',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const updated = await knowledge().updateArticle(
        actor,
        Number(context.req.param('id')),
        {
          title: body.title === undefined ? undefined : asText(body.title),
          body: body.body === undefined ? undefined : asString(body.body),
          category:
            body.category === undefined ? undefined : asString(body.category),
          published: toBoolean(body.published),
        },
      );
      return context.json({ data: updated });
    }),
  );

  router.delete(
    '/knowledge/articles/:id',
    route(async (context) => {
      const actor = await requireActor(context, access());
      await knowledge().deleteArticle(actor, Number(context.req.param('id')));
      return context.json({ data: { removed: true } });
    }),
  );

  router.get(
    '/knowledge/manual-knowledge-base',
    route(async (context) => {
      const actor = await requireActor(context, access());
      access().assertCanReadKnowledge(actor);
      return context.json({
        data: {
          knowledgeBaseKey: DEVICE_MANUAL_KNOWLEDGE_BASE_KEY,
          canManage: actor.isRoot || actor.isSupervisor,
        },
      });
    }),
  );

  router.get(
    '/knowledge/manuals',
    route(async (context) => {
      const actor = await requireActor(context, access());
      return context.json({ data: knowledge().listManuals(actor) });
    }),
  );

  router.get(
    '/knowledge/manuals/:slug',
    route(async (context) => {
      const actor = await requireActor(context, access());
      return context.json({
        data: knowledge().getManual(actor, context.req.param('slug') ?? ''),
      });
    }),
  );

  return router;
}
