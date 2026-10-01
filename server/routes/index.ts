import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import { Hono } from 'hono';
import { materialsServiceToken } from '../materials/service.js';

function readId(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** A JSON object body, or an empty object for a malformed or absent one. */
async function readJsonObject(request: {
  json: () => Promise<unknown>;
}): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono<AuthorizationEnv & AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const materials = app.container.resolve(materialsServiceToken);

    // Every path this contribution owns authenticates first, then resolves the
    // request's authorization context. Nothing here is public.
    router.use('/materials', auth.required(), authz.middleware());
    router.use('/materials/*', auth.required(), authz.middleware());
    router.use('/assistant', auth.required(), authz.middleware());
    router.use('/assistant/*', auth.required(), authz.middleware());

    // Read-only listing of the materials the caller may read. A colleague sees
    // two rows, a supervisor three; the record-level policy does the filtering.
    router.get('/materials', async (context) => {
      const data = await materials.list(context.get('authz'));
      const canManage = await materials.canManage(context.get('authz'));
      return context.json({ data: { materials: data, canManage } });
    });

    router.get('/materials/:id', async (context) => {
      const id = readId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'BAD_REQUEST' }, 400);
      }
      const material = await materials.get(context.get('authz'), id);
      if (!material) {
        // A material the caller may not read is indistinguishable from one
        // that does not exist, so an invisible material never leaks its title.
        return context.json({ code: 'NOT_FOUND' }, 404);
      }
      return context.json({ data: material });
    });

    // Editing is supervisor-only. The repository policy carries the same rule,
    // so a write can never slip past the read check above.
    router.patch('/materials/:id', async (context) => {
      const id = readId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'BAD_REQUEST' }, 400);
      }
      const authzContext = context.get('authz');
      if (!(await materials.canManage(authzContext))) {
        return context.json({ code: 'FORBIDDEN' }, 403);
      }
      const body = await readJsonObject(context.req);
      const values: { title?: string; body?: string; visibility?: string } = {};
      if (typeof body.title === 'string' && body.title.trim()) {
        values.title = body.title.trim();
      }
      if (typeof body.body === 'string' && body.body.trim()) {
        values.body = body.body.trim();
      }
      if (body.visibility === 'public' || body.visibility === 'supervisor') {
        values.visibility = body.visibility;
      }
      if (Object.keys(values).length === 0) {
        return context.json({ code: 'BAD_REQUEST' }, 400);
      }
      const material = await materials.update(authzContext, id, values);
      if (!material) {
        return context.json({ code: 'NOT_FOUND' }, 404);
      }
      return context.json({ data: material });
    });

    // Ask the assistant. The answer is grounded in readable materials only and
    // is always accompanied by the citations it used.
    router.post('/assistant/ask', async (context) => {
      const body = await readJsonObject(context.req);
      const question =
        typeof body.question === 'string' ? body.question.trim() : '';
      if (!question) {
        return context.json({ code: 'BAD_REQUEST' }, 400);
      }
      const userId = context.get('auth')?.user?.id;
      if (!userId || typeof userId !== 'string') {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      const answer = await materials.ask(
        context.get('authz'),
        userId,
        question,
      );
      return context.json({ data: answer });
    });

    router.get('/assistant/status', (context) =>
      context.json({
        data: { configured: materials.isLLMConfigured() },
      }),
    );

    router.get('/assistant/messages', async (context) => {
      const userId = context.get('auth')?.user?.id;
      if (!userId || typeof userId !== 'string') {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      return context.json({ data: await materials.history(userId) });
    });

    router.delete('/assistant/messages', async (context) => {
      const userId = context.get('auth')?.user?.id;
      if (!userId || typeof userId !== 'string') {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      await materials.clearHistory(userId);
      return context.json({ data: { cleared: true } });
    });

    return router as unknown as Hono;
  },
);

const routes: readonly AppRouteContribution<Application>[] = [apiRoutes];

export default routes;
