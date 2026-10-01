import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  todoServiceToken,
  type TodoRecord,
  type TodoStatus,
} from '../providers/todos.js';

const TITLE_MAX_LENGTH = 255;
const NOTES_MAX_LENGTH = 2000;

/**
 * Raised by this module's own request parsing. Only this type answers 400, so
 * a programming error that happens to surface here is reported as the server
 * fault it is instead of being returned as invalid input.
 */
class TodoInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TodoInputError';
  }
}

interface TodoView {
  id: number;
  title: string;
  notes: string | null;
  completed: boolean;
  createdAt: string;
}

function serializeTodo(record: TodoRecord): TodoView {
  return {
    id: record.id,
    title: record.title,
    notes: record.notes,
    completed: record.completed,
    createdAt: new Date(record.createdAt).toISOString(),
  };
}

function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TodoInputError('A todo id must be a positive integer.');
  }
  return id;
}

function parseStatus(raw: string | undefined): TodoStatus {
  if (raw === undefined || raw === '' || raw === 'all') {
    return 'all';
  }
  if (raw === 'active' || raw === 'completed') {
    return raw;
  }
  throw new TodoInputError(
    'Todo status must be one of all, active or completed.',
  );
}

function asRecord(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TodoInputError(`${subject} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

async function readJsonBody(context: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new TodoInputError('A JSON request body is required.');
  }
  return asRecord(body, 'The request body');
}

function parseTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TodoInputError('A todo title is required.');
  }
  const title = value.trim();
  if (title.length === 0) {
    throw new TodoInputError('A todo title is required.');
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TodoInputError(
      `A todo title must be at most ${TITLE_MAX_LENGTH} characters.`,
    );
  }
  return title;
}

function parseNotes(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new TodoInputError('Todo notes must be text.');
  }
  const notes = value.trim();
  if (notes.length > NOTES_MAX_LENGTH) {
    throw new TodoInputError(
      `Todo notes must be at most ${NOTES_MAX_LENGTH} characters.`,
    );
  }
  return notes.length === 0 ? null : notes;
}

export const apiRoutes = defineApiRoutes<Application>(({ container }) => {
  const router = new Hono();
  const routes = new Hono();
  const authentication = container.resolve(authenticationToken);
  const todos = container.resolve(todoServiceToken);

  routes.onError((error, context) => {
    if (error instanceof TodoInputError) {
      return context.json(
        { code: 'INVALID_TODO_INPUT', message: error.message },
        400,
      );
    }
    throw error;
  });

  // Mounted at `/todos` through a nested router so the session requirement
  // applies to this route's paths only and cannot leak into sibling routes.
  routes.use('*', authentication.required());

  routes.get('/', async (context) => {
    const status = parseStatus(context.req.query('status'));
    const records = await todos.list(status);
    return context.json({ data: records.map(serializeTodo) });
  });

  routes.get('/:todoId', async (context) => {
    const record = await todos.get(parseId(context.req.param('todoId')));
    if (!record) {
      return context.json(
        { code: 'TODO_NOT_FOUND', message: 'Todo not found.' },
        404,
      );
    }
    return context.json({ data: serializeTodo(record) });
  });

  routes.post('/', async (context) => {
    const body = await readJsonBody(context);
    const record = await todos.create({
      title: parseTitle(body.title),
      notes: parseNotes(body.notes),
    });
    return context.json({ data: serializeTodo(record) }, 201);
  });

  routes.patch('/:todoId', async (context) => {
    const id = parseId(context.req.param('todoId'));
    const body = await readJsonBody(context);
    const changes: {
      title?: string;
      notes?: string | null;
      completed?: boolean;
    } = {};

    if ('title' in body) {
      changes.title = parseTitle(body.title);
    }
    if ('notes' in body) {
      changes.notes = parseNotes(body.notes);
    }
    if ('completed' in body) {
      if (typeof body.completed !== 'boolean') {
        throw new TodoInputError('Todo completed must be true or false.');
      }
      changes.completed = body.completed;
    }

    const record = await todos.update(id, changes);
    if (!record) {
      return context.json(
        { code: 'TODO_NOT_FOUND', message: 'Todo not found.' },
        404,
      );
    }
    return context.json({ data: serializeTodo(record) });
  });

  routes.delete('/:todoId', async (context) => {
    const removed = await todos.remove(parseId(context.req.param('todoId')));
    if (!removed) {
      return context.json(
        { code: 'TODO_NOT_FOUND', message: 'Todo not found.' },
        404,
      );
    }
    return context.body(null, 204);
  });

  router.route('/todos', routes);
  return router;
});
