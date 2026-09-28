import {
  MaterialsForbiddenError,
  MaterialsNotFoundError,
  materialsServiceToken,
  type MaterialsActor,
} from '../providers/materials.js';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

/**
 * The materials API. `materials` is a small application-owned collection with a
 * single business rule — a colleague reads the `all` materials and a manager
 * reads and edits every material — so the rule lives in `MaterialsService` and
 * these handlers only translate HTTP to it. The assistant's search tool calls
 * the same service, which is what keeps page visibility and answer visibility
 * the same rule.
 */
export const materialsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const materials = app.container.resolve(materialsServiceToken);

    // Every path below is authenticated. The middleware sits on this isolated
    // sub-router, so it cannot leak into another contribution's paths.
    routes.use('*', auth.required());

    routes.get('/', async (context) => {
      const data = await materials.listFor(actorOf(context));
      return context.json({ data });
    });

    routes.get('/:id', async (context) => {
      const material = await materials.getFor(
        actorOf(context),
        context.req.param('id'),
      );
      if (!material) {
        return context.json({ code: 'NOT_FOUND' }, 404);
      }
      return context.json({ data: material });
    });

    routes.patch('/:id', async (context) => {
      const body = await readJsonObject(context.req.raw);
      if (!body) {
        return context.json({ code: 'INVALID_INPUT' }, 400);
      }

      try {
        const material = await materials.updateFor(
          actorOf(context),
          context.req.param('id'),
          {
            title: body.title as string | undefined,
            body: body.body as string | undefined,
          },
        );
        return context.json({ data: material });
      } catch (error) {
        if (error instanceof MaterialsForbiddenError) {
          return context.json({ code: 'FORBIDDEN' }, 403);
        }
        if (error instanceof MaterialsNotFoundError) {
          return context.json({ code: 'NOT_FOUND' }, 404);
        }
        if (error instanceof TypeError) {
          return context.json({ code: 'INVALID_INPUT' }, 400);
        }
        throw error;
      }
    });

    router.route('/materials', routes);
    return router;
  });

function actorOf(context: Context<AuthEnv>): MaterialsActor {
  // `auth.required()` has already rejected an anonymous request.
  const auth = context.get('auth');
  return { id: auth?.user.id ?? '' };
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | undefined> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as Record<string, unknown>;
}
