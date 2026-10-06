import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { TICKET_CATEGORIES, TICKET_STATUSES } from '../tickets-resources.js';
import {
  createRepairTicketsService,
  TicketError,
} from '../providers/ticket-service.js';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const RESOLUTION_MAX = 5000;

const STATUS_VALUES = new Set<string>(TICKET_STATUSES);
const CATEGORY_VALUES = new Set<string>(TICKET_CATEGORIES);

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(
  request: Request,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body = await request.json();
    return isRecord(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

function requiredText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    return undefined;
  }
  return trimmed;
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  ({ container }) => {
    const router = new Hono<AuthEnv & AuthorizationEnv>();
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const database = container.resolve<DatabaseManager>(databaseManagerToken);
    const serviceFor = (context: Context<AuthEnv & AuthorizationEnv>) =>
      createRepairTicketsService(database, context.get('authz'));

    router.use('/tickets', auth.required(), authz.middleware());
    router.use('/tickets/*', auth.required(), authz.middleware());

    router.onError((error, context) => {
      if (error instanceof TicketError) {
        return context.json(errorBody(error.code, error.message), error.status);
      }
      throw error;
    });

    router.get('/tickets', async (context) => {
      const status = context.req.query('status');
      if (status !== undefined && !STATUS_VALUES.has(status)) {
        return context.json(
          errorBody('INVALID_STATUS', 'Unknown ticket status.'),
          400,
        );
      }
      return context.json({ data: await serviceFor(context).list(status) });
    });

    router.post('/tickets', async (context) => {
      const body = await readJson(context.req.raw);
      const title = requiredText(body?.title, TITLE_MAX);
      const category = body?.category;
      if (!title) {
        return context.json(
          errorBody('INVALID_TITLE', 'A title is required.'),
          400,
        );
      }
      if (typeof category !== 'string' || !CATEGORY_VALUES.has(category)) {
        return context.json(
          errorBody('INVALID_CATEGORY', 'Unknown ticket category.'),
          400,
        );
      }
      let description: string | null = null;
      if (body?.description !== undefined && body.description !== null) {
        const trimmed = requiredText(body.description, DESCRIPTION_MAX);
        if (trimmed === undefined && body.description !== '') {
          return context.json(
            errorBody('INVALID_DESCRIPTION', 'The description is too long.'),
            400,
          );
        }
        description = trimmed ?? null;
      }
      const session = context.get('auth');
      const ticket = await serviceFor(context).create(
        { title, category, description },
        session!.user.id,
      );
      return context.json({ data: ticket }, 201);
    });

    router.get('/tickets/:id', async (context) =>
      context.json({
        data: await serviceFor(context).get(context.req.param('id')),
      }),
    );

    router.post('/tickets/:id/start', async (context) => {
      const session = context.get('auth');
      return context.json({
        data: await serviceFor(context).start(
          context.req.param('id'),
          session!.user.id,
        ),
      });
    });

    router.post('/tickets/:id/complete', async (context) => {
      const body = await readJson(context.req.raw);
      const resolution = requiredText(body?.resolution, RESOLUTION_MAX);
      if (!resolution) {
        return context.json(
          errorBody(
            'INVALID_RESOLUTION',
            'A resolution is required before completing a ticket.',
          ),
          400,
        );
      }
      const session = context.get('auth');
      return context.json({
        data: await serviceFor(context).complete(
          context.req.param('id'),
          session!.user.id,
          resolution,
        ),
      });
    });

    return router as unknown as Hono;
  },
);
