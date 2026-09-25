import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  customerMemoServiceToken,
  type CreateCustomerMemoInput,
  type UpdateCustomerMemoInput,
} from '../providers/index.js';

const CUSTOMER_NAME_MAX_LENGTH = 255;
const REMARK_MAX_LENGTH = 2000;

type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly message: string };

function normalizeCustomerName(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > CUSTOMER_NAME_MAX_LENGTH) {
    return undefined;
  }

  return trimmed;
}

/**
 * `null`/absent means "no remark"; `undefined` means the caller sent something
 * that is not a string.
 */
function normalizeRemark(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length > REMARK_MAX_LENGTH) {
    return undefined;
  }

  return trimmed.length > 0 ? trimmed : null;
}

function readObjectBody(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  return body as Record<string, unknown>;
}

function parseCreateBody(body: unknown): ParseResult<CreateCustomerMemoInput> {
  const record = readObjectBody(body);
  if (!record) {
    return {
      ok: false,
      code: 'INVALID_BODY',
      message: 'Expected a JSON object.',
    };
  }

  const customerName = normalizeCustomerName(record.customerName);
  if (!customerName) {
    return {
      ok: false,
      code: 'CUSTOMER_NAME_REQUIRED',
      message: 'Customer name is required.',
    };
  }

  const remark = normalizeRemark(record.remark);
  if (remark === undefined) {
    return { ok: false, code: 'INVALID_REMARK', message: 'Invalid remark.' };
  }

  return { ok: true, value: { customerName, remark } };
}

function parseUpdateBody(body: unknown): ParseResult<UpdateCustomerMemoInput> {
  const record = readObjectBody(body);
  if (!record) {
    return {
      ok: false,
      code: 'INVALID_BODY',
      message: 'Expected a JSON object.',
    };
  }

  const value: { customerName?: string; remark?: string | null } = {};

  if ('customerName' in record) {
    const customerName = normalizeCustomerName(record.customerName);
    if (!customerName) {
      return {
        ok: false,
        code: 'CUSTOMER_NAME_REQUIRED',
        message: 'Customer name is required.',
      };
    }
    value.customerName = customerName;
  }

  if ('remark' in record) {
    const remark = normalizeRemark(record.remark);
    if (remark === undefined) {
      return { ok: false, code: 'INVALID_REMARK', message: 'Invalid remark.' };
    }
    value.remark = remark;
  }

  return { ok: true, value };
}

function parseId(value: string): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export const customerMemoRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const memos = app.container.resolve(customerMemoServiceToken);

    // Isolated sub-router: its `use('*')` guard cannot leak into other
    // contributions mounted on the outer router.
    const memoRoutes = new Hono();
    memoRoutes.use('*', auth.required());

    memoRoutes.get('/', async (context) => {
      const search = context.req.query('search')?.trim();
      return context.json({ data: await memos.list({ search }) });
    });

    memoRoutes.post('/', async (context) => {
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json(
          { code: 'INVALID_BODY', message: 'Expected a JSON object.' },
          400,
        );
      }

      const parsed = parseCreateBody(body);
      if (!parsed.ok) {
        return context.json(
          { code: parsed.code, message: parsed.message },
          422,
        );
      }

      return context.json({ data: await memos.create(parsed.value) }, 201);
    });

    memoRoutes.get('/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (!id) {
        return context.json(
          {
            code: 'CUSTOMER_MEMO_NOT_FOUND',
            message: 'Customer memo not found.',
          },
          404,
        );
      }

      const memo = await memos.get(id);
      if (!memo) {
        return context.json(
          {
            code: 'CUSTOMER_MEMO_NOT_FOUND',
            message: 'Customer memo not found.',
          },
          404,
        );
      }

      return context.json({ data: memo });
    });

    memoRoutes.patch('/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (!id) {
        return context.json(
          {
            code: 'CUSTOMER_MEMO_NOT_FOUND',
            message: 'Customer memo not found.',
          },
          404,
        );
      }

      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json(
          { code: 'INVALID_BODY', message: 'Expected a JSON object.' },
          400,
        );
      }

      const parsed = parseUpdateBody(body);
      if (!parsed.ok) {
        return context.json(
          { code: parsed.code, message: parsed.message },
          422,
        );
      }

      const memo = await memos.update(id, parsed.value);
      if (!memo) {
        return context.json(
          {
            code: 'CUSTOMER_MEMO_NOT_FOUND',
            message: 'Customer memo not found.',
          },
          404,
        );
      }

      return context.json({ data: memo });
    });

    memoRoutes.delete('/:id', async (context) => {
      const id = parseId(context.req.param('id'));
      if (!id || !(await memos.remove(id))) {
        return context.json(
          {
            code: 'CUSTOMER_MEMO_NOT_FOUND',
            message: 'Customer memo not found.',
          },
          404,
        );
      }

      return context.json({ data: { deleted: true } });
    });

    router.route('/customer-memos', memoRoutes);
    return router;
  });
