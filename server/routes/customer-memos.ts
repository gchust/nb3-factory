import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken, RepositoryError } from '@nocobase/db';
import { Hono } from 'hono';
import type { Context } from 'hono';

/**
 * The memo as the browser sees it: timestamps are normalized to ISO strings and
 * the id is a string, so the client never has to interpret a driver-specific
 * representation.
 */
export interface CustomerMemoDto {
  readonly id: string;
  readonly name: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CustomerMemoRecord {
  readonly id: string;
  readonly name: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CustomerMemoValues {
  readonly name?: unknown;
  readonly notes?: unknown;
}

const NAME_MAX_LENGTH = 255;

/** Every failure the endpoints report, so the client can branch on a code rather than a message. */
class CustomerMemoError extends Error {
  public readonly code: string;
  public readonly status: 400 | 404;

  public constructor(code: string, status: 400 | 404, message: string) {
    super(message);
    this.name = 'CustomerMemoError';
    this.code = code;
    this.status = status;
  }
}

function notFound(): CustomerMemoError {
  return new CustomerMemoError(
    'CUSTOMER_MEMO_NOT_FOUND',
    404,
    'The customer memo does not exist.',
  );
}

/**
 * Validate the writable fields. `name` is required on create and, when sent on
 * update, must still be a non-empty string. `notes` may be omitted or null.
 */
function readWritingValues(
  body: unknown,
  { requireName }: { requireName: boolean },
): { name: string; notes: string | null } {
  const values = (
    body && typeof body === 'object' ? body : {}
  ) as CustomerMemoValues;
  const name = typeof values.name === 'string' ? values.name.trim() : undefined;

  if (requireName && name === undefined) {
    throw new CustomerMemoError(
      'CUSTOMER_MEMO_NAME_REQUIRED',
      400,
      'The customer name is required.',
    );
  }
  if (name !== undefined && name.length === 0) {
    throw new CustomerMemoError(
      'CUSTOMER_MEMO_NAME_REQUIRED',
      400,
      'The customer name is required.',
    );
  }
  if (name !== undefined && name.length > NAME_MAX_LENGTH) {
    throw new CustomerMemoError(
      'CUSTOMER_MEMO_NAME_TOO_LONG',
      400,
      `The customer name must be at most ${NAME_MAX_LENGTH} characters.`,
    );
  }

  const notes =
    values.notes === null || values.notes === undefined
      ? null
      : typeof values.notes === 'string'
        ? values.notes.trim()
        : undefined;
  if (notes === undefined) {
    throw new CustomerMemoError(
      'CUSTOMER_MEMO_INVALID',
      400,
      'The notes must be text.',
    );
  }

  return { name: name ?? '', notes: notes && notes.length > 0 ? notes : null };
}

function toDto(record: CustomerMemoRecord): CustomerMemoDto {
  return {
    id: String(record.id),
    name: String(record.name),
    notes:
      record.notes === null || record.notes === undefined
        ? null
        : String(record.notes),
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
}

/** A missing record is an expected outcome, not a server failure, so it becomes the 404 body. */
function isRecordNotFound(error: unknown): boolean {
  return error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND';
}

async function readJsonBody(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const { container } = app;
    const router = new Hono();
    const memos = new Hono();
    const authentication = container.resolve(authenticationToken);
    const database = container.resolve(databaseManagerToken);
    const repository = database.repository<CustomerMemoRecord>('customerMemos');

    // Every endpoint below lives under /customer-memos, so installing
    // authentication on this isolated sub-router covers the collection path and
    // every member path without leaking into a sibling contribution.
    memos.use('*', authentication.required());

    memos.onError((error, context) => {
      if (!(error instanceof CustomerMemoError)) throw error;
      return context.json(
        { code: error.code, message: error.message },
        error.status,
      );
    });

    memos.get('/', async (context) => {
      const search = context.req.query('search')?.trim();
      const records = await repository.findMany({
        filter: search
          ? (filter) =>
              filter.string('name').includes(search, { mode: 'insensitive' })
          : undefined,
        sort: (sort) => sort.field('createdAt').desc(),
      });
      return context.json({ data: records.map(toDto) });
    });

    memos.post('/', async (context) => {
      const { name, notes } = readWritingValues(await readJsonBody(context), {
        requireName: true,
      });
      const now = new Date().toISOString();
      const { record } = await repository.createOne({
        values: {
          id: crypto.randomUUID(),
          name,
          notes,
          createdAt: now,
          updatedAt: now,
        },
      });
      return context.json({ data: toDto(record) }, 201);
    });

    memos.get('/:id', async (context) => {
      const record = await repository.findOne({
        filter: { id: context.req.param('id') },
      });
      if (!record) throw notFound();
      return context.json({ data: toDto(record) });
    });

    memos.patch('/:id', async (context) => {
      const body = await readJsonBody(context);
      const hasName = Boolean(
        body && typeof body === 'object' && 'name' in body,
      );
      const { name, notes } = readWritingValues(body, { requireName: hasName });
      const changes: {
        updatedAt: string;
        name?: string;
        notes?: string | null;
      } = { updatedAt: new Date().toISOString() };
      if (hasName) changes.name = name;
      if (body && typeof body === 'object' && 'notes' in body)
        changes.notes = notes;

      let record;
      try {
        ({ record } = await repository.updateOne({
          filter: { id: context.req.param('id') },
          values: changes,
        }));
      } catch (error) {
        if (isRecordNotFound(error)) throw notFound();
        throw error;
      }
      return context.json({ data: toDto(record) });
    });

    memos.delete('/:id', async (context) => {
      try {
        await repository.deleteOne({ filter: { id: context.req.param('id') } });
      } catch (error) {
        if (isRecordNotFound(error)) throw notFound();
        throw error;
      }
      return context.body(null, 204);
    });

    router.route('/customer-memos', memos);
    return router;
  },
);

export default apiRoutes;
