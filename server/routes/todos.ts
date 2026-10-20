import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponses,
  apiValidator,
  defineApiRoutes,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';

import type { TodoRow } from '../providers/todos.js';

const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  dueAt: z.iso.datetime(),
  completed: z.boolean(),
  expired: z.boolean(),
});

const TodoListMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

const TodoListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function serializeTodo(todo: TodoRow): z.infer<typeof TodoSchema> {
  return {
    id: todo.id,
    title: todo.title,
    dueAt: new Date(todo.dueAt).toISOString(),
    completed: todo.completed,
    expired: todo.expired,
  };
}

export function createTodoRoutes(app: Application): Hono {
  const router = new Hono<AuthorizationEnv>();
  const authentication = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);

  router.use('/todos', authentication.required(), authorization.middleware());

  router.get(
    '/todos',
    describeRoute({
      tags: ['Todos'],
      summary: 'List todos',
      description:
        'Lists the todos visible to the signed-in user, earliest due date first. ' +
        'The list is read through the record policy of the todos collection, so ' +
        'the endpoint never broadens access beyond the user’s grants.',
      responses: {
        '200': listResponse(TodoSchema, TodoListMetaSchema, 'A page of todos.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', TodoListQuery),
    async (context) => {
      const { page, pageSize } = context.req.valid('query');
      const database = app.container.resolve(databaseManagerToken);
      const policy = await authorization.database.policyFor(
        'todos',
        context.var.authz,
      );
      if (policy.read === false) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'TODOS_READ_DENIED',
          domain: 'todos',
          message: 'Reading todos is not allowed.',
        });
      }
      const todos = database.repository<TodoRow>('todos').withPolicy(policy);
      const [rows, total] = await Promise.all([
        todos.findMany({
          sort: (sort) => sort.field('dueAt').asc(),
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        todos.count(),
      ]);

      return context.json({
        // The repository widens an unselected read to Partial; every field of
        // an unselected row is present at runtime, and the response schema
        // above documents the exact shape.
        data: rows.map((row) => serializeTodo(row as TodoRow)),
        meta: { page, pageSize, total },
      });
    },
  );

  return new Hono().route('/', router);
}

export default [defineApiRoutes<Application>(createTodoRoutes)];
