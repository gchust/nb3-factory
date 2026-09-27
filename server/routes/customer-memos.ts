import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { databaseManagerToken, RepositoryError } from '@nocobase/db';
import { Hono } from 'hono';

const COLLECTION = 'customerMemos';
const MAX_CUSTOMER_NAME_LENGTH = 200;

/** A row of the one business table this application owns. */
interface CustomerMemoRecord {
  readonly id: number;
  readonly customerName: string;
  readonly note: string | null;
  readonly createdAt: string;
}

/** The writable fields the API accepts. */
interface CustomerMemoInput {
  readonly customerName: string;
  readonly note: string | null;
}

/** Raised for a request body that violates the memo's own rules. */
class CustomerMemoInputError extends Error {
  public readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/**
 * Validates the body and normalizes it: the customer name is required and the
 * note is optional. Trimming happens here rather than in the browser so the
 * same rule holds for any caller of the API.
 */
function parseMemoInput(body: unknown): CustomerMemoInput {
  const source =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const rawName = source.customerName;
  const customerName = typeof rawName === 'string' ? rawName.trim() : '';
  if (customerName.length === 0) {
    throw new CustomerMemoInputError('CUSTOMER_MEMO_NAME_REQUIRED');
  }
  if (customerName.length > MAX_CUSTOMER_NAME_LENGTH) {
    throw new CustomerMemoInputError('CUSTOMER_MEMO_NAME_TOO_LONG');
  }
  const rawNote = source.note;
  const note =
    typeof rawNote === 'string' && rawNote.trim().length > 0
      ? rawNote.trim()
      : null;
  return { customerName, note };
}

function parseId(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export const customerMemoApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);

    // Every endpoint is behind the login session, including the sub-paths.
    router.use('/customer-memos', auth.required());
    router.use('/customer-memos/*', auth.required());

    router.get('/customer-memos', async (context) => {
      const search = context.req.query('search')?.trim();
      const memos = app.container
        .resolve(databaseManagerToken)
        .repository<CustomerMemoRecord>(COLLECTION);
      const records = await memos.findMany({
        filter: search
          ? (filter) =>
              filter.string('customerName').includes(search, {
                mode: 'insensitive',
              })
          : undefined,
        sort: (sort) => sort.field('createdAt').desc(),
      });
      return context.json({ data: records });
    });

    router.post('/customer-memos', async (context) => {
      let input: CustomerMemoInput;
      try {
        input = parseMemoInput(await context.req.json());
      } catch (error) {
        if (error instanceof CustomerMemoInputError) {
          return context.json({ code: error.code }, 400);
        }
        return context.json({ code: 'CUSTOMER_MEMO_INVALID_BODY' }, 400);
      }
      const memos = app.container
        .resolve(databaseManagerToken)
        .repository<CustomerMemoRecord>(COLLECTION);
      const record = await memos.createOne({
        values: { ...input, createdAt: new Date().toISOString() },
      });
      return context.json({ data: record.record }, 201);
    });

    router.get('/customer-memos/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'CUSTOMER_MEMO_NOT_FOUND' }, 404);
      }
      const memos = app.container
        .resolve(databaseManagerToken)
        .repository<CustomerMemoRecord>(COLLECTION);
      const record = await memos.findOne({ filter: { id } });
      if (!record) {
        return context.json({ code: 'CUSTOMER_MEMO_NOT_FOUND' }, 404);
      }
      return context.json({ data: record });
    });

    router.patch('/customer-memos/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'CUSTOMER_MEMO_NOT_FOUND' }, 404);
      }
      let input: CustomerMemoInput;
      try {
        input = parseMemoInput(await context.req.json());
      } catch (error) {
        if (error instanceof CustomerMemoInputError) {
          return context.json({ code: error.code }, 400);
        }
        return context.json({ code: 'CUSTOMER_MEMO_INVALID_BODY' }, 400);
      }
      const memos = app.container
        .resolve(databaseManagerToken)
        .repository<CustomerMemoRecord>(COLLECTION);
      try {
        const record = await memos.updateOne({
          filter: { id },
          values: input,
        });
        return context.json({ data: record.record });
      } catch (error) {
        if (
          error instanceof RepositoryError &&
          error.code === 'RECORD_NOT_FOUND'
        ) {
          return context.json({ code: 'CUSTOMER_MEMO_NOT_FOUND' }, 404);
        }
        throw error;
      }
    });

    router.delete('/customer-memos/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (id === undefined) {
        return context.json({ code: 'CUSTOMER_MEMO_NOT_FOUND' }, 404);
      }
      const memos = app.container
        .resolve(databaseManagerToken)
        .repository<CustomerMemoRecord>(COLLECTION);
      try {
        await memos.deleteOne({ filter: { id } });
        return context.body(null, 204);
      } catch (error) {
        if (
          error instanceof RepositoryError &&
          error.code === 'RECORD_NOT_FOUND'
        ) {
          return context.json({ code: 'CUSTOMER_MEMO_NOT_FOUND' }, 404);
        }
        throw error;
      }
    });

    return router;
  });
