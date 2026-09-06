import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Context } from 'hono';
import { Hono } from 'hono';

import {
  AssigneeNotFoundError,
  InvalidStatusTransitionError,
  isTicketCategory,
  isTicketPriority,
  isTicketStatus,
  itTicketServiceToken,
  TicketNotFoundError,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '../providers/index.js';

/** The session shape `auth.required()` stores on the Hono context. */
interface AuthSession {
  user: {
    id: string;
    name?: string;
    email?: string;
  };
}

interface ListFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  assigneeId?: string;
  requesterId?: string;
  search?: string;
}

type DeskEnv = { Variables: { auth: AuthSession } };

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const tickets = app.container.resolve(itTicketServiceToken);

    // The desk's own sub-router. Middleware is scoped to the paths this contribution owns; the mounted prefix keeps
    // `auth.required()` from leaking into any later contribution.
    const routes = new Hono<DeskEnv>();
    routes.use('*', auth.required());

    routes.get('/staff', async (context) =>
      context.json({ data: await tickets.assigneeCandidates() }),
    );

    routes.get('/', async (context) => {
      const query = context.req.query();
      const page = query.page === undefined ? undefined : Number(query.page);
      const pageSize =
        query.pageSize === undefined ? undefined : Number(query.pageSize);

      const filters = parseListQuery(query);
      if (typeof filters === 'string') {
        return context.json({ code: 'INVALID_FILTER', message: filters }, 400);
      }

      const result = await tickets.list({ ...filters, page, pageSize });

      return context.json({
        data: result.items,
        meta: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        },
      });
    });

    routes.post('/', async (context) => {
      const body = await readJsonBody(context);
      if (!body) {
        return context.json(
          {
            code: 'INVALID_JSON',
            message: 'Request body must be a JSON object.',
          },
          400,
        );
      }

      const title = readString(body.title);
      const description = readString(body.description);
      if (!title || !description) {
        return context.json(
          {
            code: 'VALIDATION_ERROR',
            message: 'title and description are required.',
          },
          400,
        );
      }
      if (
        !isTicketCategory(body.category) ||
        !isTicketPriority(body.priority)
      ) {
        return context.json(
          {
            code: 'VALIDATION_ERROR',
            message: 'category and priority must be valid values.',
          },
          400,
        );
      }

      const session = context.get('auth');
      const created = await tickets.create(
        {
          title: title.trim(),
          description: description.trim(),
          category: body.category,
          priority: body.priority,
        },
        session.user.id,
      );
      return context.json({ data: created }, 201);
    });

    routes.get('/:id', async (context) => {
      const id = parseTicketId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'Ticket id must be a number.' },
          400,
        );
      }

      try {
        return context.json({ data: await tickets.getById(id) });
      } catch (error) {
        return mapTicketError(context, error);
      }
    });

    routes.put('/:id', async (context) => {
      const id = parseTicketId(context.req.param('id'));
      if (id === undefined) {
        return context.json(
          { code: 'INVALID_ID', message: 'Ticket id must be a number.' },
          400,
        );
      }

      const body = await readJsonBody(context);
      if (!body) {
        return context.json(
          {
            code: 'INVALID_JSON',
            message: 'Request body must be a JSON object.',
          },
          400,
        );
      }

      const input: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        switch (key) {
          case 'title': {
            const text = readString(value);
            if (!text) {
              return invalidUpdate(
                context,
                'title must be a non-empty string.',
              );
            }
            input.title = text.trim();
            break;
          }
          case 'description': {
            const text = readString(value);
            if (text === undefined) {
              return invalidUpdate(context, 'description must be a string.');
            }
            input.description = text.trim();
            break;
          }
          case 'category':
            if (!isTicketCategory(value)) {
              return invalidUpdate(context, 'category is not valid.');
            }
            input.category = value;
            break;
          case 'priority':
            if (!isTicketPriority(value)) {
              return invalidUpdate(context, 'priority is not valid.');
            }
            input.priority = value;
            break;
          case 'status':
            if (!isTicketStatus(value)) {
              return invalidUpdate(context, 'status is not valid.');
            }
            input.status = value;
            break;
          case 'assigneeId':
            if (value !== null && typeof value !== 'string') {
              return invalidUpdate(
                context,
                'assigneeId must be a string or null.',
              );
            }
            input.assigneeId = value;
            break;
          case 'resolution':
            if (value !== null && typeof value !== 'string') {
              return invalidUpdate(
                context,
                'resolution must be a string or null.',
              );
            }
            input.resolution = value;
            break;
          default:
            return invalidUpdate(context, `Unknown field "${key}".`);
        }
      }

      if (Object.keys(input).length === 0) {
        return invalidUpdate(context, 'Nothing to update.');
      }

      try {
        const updated = await tickets.update(id, input);
        return context.json({ data: updated });
      } catch (error) {
        return mapTicketError(context, error);
      }
    });

    router.route('/it-service-desk/tickets', routes);
    return router;
  },
);

function parseListQuery(
  query: Record<string, string | undefined>,
): ListFilters | string {
  const filters: ListFilters = {};

  if (query.status !== undefined) {
    if (!isTicketStatus(query.status)) {
      return `Unknown status "${query.status}".`;
    }
    filters.status = query.status;
  }
  if (query.priority !== undefined) {
    if (!isTicketPriority(query.priority)) {
      return `Unknown priority "${query.priority}".`;
    }
    filters.priority = query.priority;
  }
  if (query.category !== undefined) {
    if (!isTicketCategory(query.category)) {
      return `Unknown category "${query.category}".`;
    }
    filters.category = query.category;
  }
  if (query.assigneeId !== undefined && query.assigneeId !== '') {
    filters.assigneeId = query.assigneeId;
  }
  if (query.requesterId !== undefined && query.requesterId !== '') {
    filters.requesterId = query.requesterId;
  }
  if (query.search !== undefined && query.search.trim() !== '') {
    filters.search = query.search;
  }

  return filters;
}

function parseTicketId(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return undefined;
  }
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

async function readJsonBody(
  context: Context,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await context.req.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return undefined;
    }
    return body as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function invalidUpdate(context: Context, message: string): Response {
  return context.json({ code: 'VALIDATION_ERROR', message }, 400);
}

function mapTicketError(context: Context, error: unknown): Response {
  if (error instanceof TicketNotFoundError) {
    return context.json({ code: 'NOT_FOUND', message: error.message }, 404);
  }
  if (
    error instanceof InvalidStatusTransitionError ||
    error instanceof AssigneeNotFoundError
  ) {
    return context.json(
      { code: 'VALIDATION_ERROR', message: error.message },
      400,
    );
  }
  throw error;
}
