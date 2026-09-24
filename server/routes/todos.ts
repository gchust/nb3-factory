import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { RepositoryError } from '@nocobase/db';
import { Hono } from 'hono';

import { todoServiceToken } from '../providers/index.js';

const MAX_TITLE_LENGTH = 255;

/** Reads a JSON body, treating malformed JSON as no body rather than a 500. */
async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function parseId(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * The page's own endpoints. Each route owns its security: the whole `/todos`
 * prefix is behind a session, and mounting under `/api` alone authenticates
 * nothing. The feature is intentionally open to every signed-in user, so this
 * does not add a permission check; a per-user scope would be the place to add
 * one.
 */
export const todosApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const todos = app.container.resolve(todoServiceToken);

    // An isolated sub-router mounted at the feature's prefix, so the session
    // check covers `/todos` and every sub-path below it without a wildcard on
    // the shared router that would leak into other contributions.
    const todosRouter = new Hono();
    todosRouter.use('*', auth.required());

    todosRouter.get('/', async (context) =>
      context.json({ data: await todos.list() }),
    );

    todosRouter.post('/', async (context) => {
      const body = await readJsonBody(context.req.raw);
      const title =
        typeof body?.title === 'string' ? body.title.trim() : undefined;
      const dueAt =
        typeof body?.dueAt === 'string' ? new Date(body.dueAt) : undefined;

      if (
        !title ||
        title.length > MAX_TITLE_LENGTH ||
        !dueAt ||
        Number.isNaN(dueAt.getTime())
      ) {
        return context.json(
          {
            code: 'INVALID_INPUT',
            message: 'title and a valid dueAt are required.',
          },
          400,
        );
      }

      const record = await todos.create({ title, dueAt });
      return context.json({ data: record }, 201);
    });

    todosRouter.patch('/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      const body = await readJsonBody(context.req.raw);
      const completed = body?.completed;

      if (id === undefined || typeof completed !== 'boolean') {
        return context.json(
          {
            code: 'INVALID_INPUT',
            message: 'a numeric id and a boolean completed are required.',
          },
          400,
        );
      }

      try {
        const record = await todos.setCompleted(id, completed);
        return context.json({ data: record });
      } catch (error) {
        // `updateOne` matches exactly one row: a missing id is a 404, not a 500.
        if (
          error instanceof RepositoryError &&
          error.code === 'RECORD_NOT_FOUND'
        ) {
          return context.json({ code: 'NOT_FOUND' }, 404);
        }
        throw error;
      }
    });

    router.route('/todos', todosRouter);
    return router;
  });
