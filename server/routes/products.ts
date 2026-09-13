import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { FileRepositoryError } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  ProductError,
  productsServiceToken,
  type ProductSaveInput,
} from '../providers/products.js';

/**
 * Business endpoints of the product gallery, mounted under `/api`.
 *
 * Every path requires a signed-in session (`auth.required()`); the upload
 * endpoints served by the File plugin are protected separately in
 * `server/routes/index.ts`.
 */
export const productsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(productsServiceToken);

    router.use('*', auth.required());

    router.post(
      '/products:list',
      respond(() => service.list()),
    );
    router.post(
      '/products:get',
      respond(async (context) => {
        const { filter } = await readJsonBody(context.req);
        return service.get(readId(filter));
      }),
    );
    router.post(
      '/products:create',
      respond(async (context) => {
        const { values } = await readJsonBody(context.req);
        return service.create(readSaveInput(values));
      }),
    );
    router.post(
      '/products:update',
      respond(async (context) => {
        const { filter, values } = await readJsonBody(context.req);
        return service.update(readId(filter), readSaveInput(values));
      }),
    );

    return router;
  });

function respond(handler: (context: Context) => Promise<unknown>) {
  return async (context: Context): Promise<Response> => {
    try {
      return context.json({ data: await handler(context) });
    } catch (error) {
      return writeError(context, error);
    }
  };
}

function writeError(context: Context, error: unknown): Response {
  if (error instanceof ProductError) {
    return context.json(
      { code: error.code, message: error.message },
      error.status as ContentfulStatusCode,
    );
  }
  if (error instanceof FileRepositoryError) {
    return context.json({ code: error.code, message: error.message }, 400);
  }
  console.error('[products] request failed:', error);
  return context.json(
    { code: 'INTERNAL_ERROR', message: '服务器内部错误，请稍后重试。' },
    500,
  );
}

async function readJsonBody(
  req: Context['req'],
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new ProductError('PRODUCT_BODY_INVALID', '请求数据格式不正确。');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ProductError('PRODUCT_BODY_INVALID', '请求数据格式不正确。');
  }
  return parsed as Record<string, unknown>;
}

function readId(filter: unknown): number {
  const id = Number((filter as { id?: unknown } | undefined)?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ProductError('PRODUCT_ID_INVALID', '产品编号参数不正确。');
  }
  return id;
}

function readSaveInput(values: unknown): ProductSaveInput {
  if (typeof values !== 'object' || values === null) {
    throw new ProductError('PRODUCT_VALUES_REQUIRED', '产品数据不能为空。');
  }
  return values as ProductSaveInput;
}
