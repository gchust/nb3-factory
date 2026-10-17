import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';

import { todoServiceToken } from '../providers/todos.js';
import {
  CreateTodoInput,
  TodoListQuery,
  TodoPageMeta,
  TodoParams,
  TodoSchema,
  UpdateTodoInput,
} from './schemas.js';

/** The page grant that guards every todo route. */
const TODOS_PAGE_RESOURCE = 'todos';
const ERROR_DOMAIN = 'todos';

const tags = ['Todos'];
const accessDescription = `Requires the \`page:${TODOS_PAGE_RESOURCE}/access\` grant; without it every route answers 403 \`TODO_ACCESS_REQUIRED\` before any todo is looked up.`;

function todoNotFound(todoId: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'TODO_NOT_FOUND',
    domain: ERROR_DOMAIN,
    message: `Todo ${todoId} was not found.`,
  });
}

/**
 * The todo page's API: list, create, and toggle completion.
 *
 * Expiry is not writable here on purpose. The `expired` flag is the scheduled sweep's business, and an endpoint that
 * let a client set it would stop the page from being evidence of what the schedule did. The sweep runs through
 * `todoServiceToken.expireDue()` from the Scheduler target, never from this router.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  ({ container }) => {
    // The handlers run on a router typed with `AuthorizationEnv`, so `context.get('authz')` resolves to the
    // `AuthorizationContext` the middleware sets instead of `any`. `defineApiRoutes()` expects a blank-env
    // router, so this one is mounted inside a fresh `Hono()` at the end rather than returned directly.
    const routes = new Hono<AuthorizationEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const todos = container.resolve(todoServiceToken);

    // Checked before any todo is looked up, so a caller without access cannot probe which ids exist.
    const requirePageAccess: MiddlewareHandler<AuthorizationEnv> = async (
      context,
      next,
    ) => {
      const allowed = await context.get('authz').can({
        resource: { type: 'page', id: TODOS_PAGE_RESOURCE },
        action: 'access',
      });
      if (!allowed)
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'TODO_ACCESS_REQUIRED',
          domain: ERROR_DOMAIN,
          message: 'Todo page access is required.',
        });
      await next();
    };

    // Scoped to the paths this route owns: a `routes.use('*')` would leak into every contribution registered after
    // this one. Both the collection path and its sub-paths need the guard: `/todos` alone does not match `:todoId`.
    routes.use(
      '/todos',
      authentication.required(),
      authorization.middleware(),
      requirePageAccess,
    );
    routes.use(
      '/todos/*',
      authentication.required(),
      authorization.middleware(),
      requirePageAccess,
    );

    routes.get(
      '/todos',
      describeRoute({
        tags,
        summary: 'List todos',
        operationId: 'todosList',
        description: `Ordered by due time, soonest first. Pages by \`page\` and \`pageSize\`. ${accessDescription}`,
        responses: {
          200: listResponse(TodoSchema, TodoPageMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', TodoListQuery),
      async (context) => {
        const { page, pageSize } = context.req.valid('query');
        const items = await todos.list();
        const start = (page - 1) * pageSize;
        return context.json({
          data: items.slice(start, start + pageSize),
          meta: { page, pageSize, total: items.length },
        });
      },
    );

    routes.post(
      '/todos',
      describeRoute({
        tags,
        summary: 'Create a todo',
        operationId: 'todosCreate',
        description: `A new todo starts neither completed nor expired; the scheduled sweep decides expiry. ${accessDescription}`,
        responses: {
          201: dataResponse(TodoSchema, 'The created todo.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateTodoInput),
      async (context) => {
        const todo = await todos.create(context.req.valid('json'));
        return context.json({ data: todo }, 201);
      },
    );

    routes.patch(
      '/todos/:todoId',
      describeRoute({
        tags,
        summary: 'Mark a todo completed or open again',
        operationId: 'todosSetCompleted',
        description: `Changes only \`completed\`; \`expired\` belongs to the scheduled sweep. ${accessDescription}`,
        responses: {
          200: dataResponse(TodoSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(
            404,
            'No todo with this id exists (`TODO_NOT_FOUND`).',
          ),
        },
      }),
      apiValidator('param', TodoParams),
      apiValidator('json', UpdateTodoInput),
      async (context) => {
        const { todoId } = context.req.valid('param');
        const { completed } = context.req.valid('json');
        const todo = await todos.setCompleted(todoId, completed);
        if (!todo) throw todoNotFound(todoId);
        return context.json({ data: todo });
      },
    );

    return new Hono().route('/', routes);
  },
);
