import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  expenseClaimServiceToken,
  type CreateExpenseClaimInput,
  ExpenseClaimValidationError,
  isFinanceUser,
} from '../providers/expense-claims.js';

/**
 * Expense reimbursement (报销) routes.
 *
 * Every route owns its own authentication and authorization; mounting under
 * `/api` authenticates nothing. The upload route and the content route
 * replicate the file plugin's own handlers because the generic file-repository
 * routes are public and cannot express the per-claim ownership policy.
 */

const MAX_UPLOAD_BATCH_BYTES = 20 * 1024 * 1024;

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app: Application) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const fileManager = app.container.resolve(serverFileRepositoryManagerToken);
    const claims = app.container.resolve(expenseClaimServiceToken);
    const files = fileManager.repository('expense_claim_files', {
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/expense-claims',
    });
    const publicBasePath = (app.publicBasePath ?? '').replace(/\/$/, '');

    router.onError((error, context) => {
      if (error instanceof ExpenseClaimValidationError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as ContentfulStatusCode,
        );
      }
      throw error;
    });

    router.post(
      '/expenseClaimFiles:uploadMany',
      authentication.required(),
      bodyLimit({
        maxSize: MAX_UPLOAD_BATCH_BYTES,
        onError: (context) =>
          context.json(
            {
              code: 'BODY_TOO_LARGE',
              message: '上传文件过大（单次上传上限 20MB）。',
            },
            413,
          ),
      }),
      async (context) => {
        if (
          !context.req
            .header('content-type')
            ?.toLowerCase()
            .startsWith('multipart/form-data;')
        ) {
          return context.json(
            {
              code: 'UNSUPPORTED_MEDIA_TYPE',
              message: 'Expected multipart/form-data.',
            },
            415,
          );
        }
        let body: Record<string, unknown>;
        try {
          body = await context.req.parseBody({ all: true });
        } catch {
          return context.json(
            { code: 'INVALID_MULTIPART', message: 'Invalid multipart body.' },
            400,
          );
        }
        const value = body.file;
        const uploads = Array.isArray(value)
          ? value
          : value === undefined
            ? []
            : [value];
        if (!uploads.length || !uploads.every((file) => file instanceof File)) {
          return context.json(
            {
              code: 'INVALID_FILES',
              message: 'At least one File is required.',
            },
            400,
          );
        }
        const upload = await files.uploadMany({
          files: uploads,
        });
        return context.json({
          data: {
            createdCount: upload.createdCount,
            records: upload.records.map((record) => ({
              ...record,
              contentUrl: `${publicBasePath}${files.getUrl(record)}`,
            })),
          },
        });
      },
    );

    router.use('/expense-claims', authentication.required());
    router.use('/expense-claims/*', authentication.required());

    router.get('/expense-claims', async (context) => {
      const userId = requireUserId(context);
      const isFinance = await isFinanceUser(authorization, userId);
      return context.json({ data: await claims.list(userId, isFinance) });
    });

    router.post('/expense-claims', async (context) => {
      const userId = requireUserId(context);
      const input = await context.req.json<CreateExpenseClaimInput>();
      const { id, claimNumber } = await claims.create(userId, {
        expenseType: input.expenseType,
        expenseDate: input.expenseDate,
        totalAmount: input.totalAmount,
        description: input.description ?? null,
        items: Array.isArray(input.items) ? input.items : [],
        attachments: Array.isArray(input.attachments)
          ? input.attachments
          : undefined,
      });
      return context.json({ data: { id, claimNumber } }, 201);
    });

    router.get('/expense-claims/:id', async (context) => {
      const userId = requireUserId(context);
      const isFinance = await isFinanceUser(authorization, userId);
      const detail = await claims.getDetail(
        context.req.param('id'),
        userId,
        isFinance,
        publicBasePath,
      );
      if (!detail) {
        return context.json(
          { code: 'CLAIM_NOT_FOUND', message: '报销单不存在。' },
          404,
        );
      }
      return context.json({ data: detail });
    });

    router.post('/expense-claims/:id/review', async (context) => {
      const userId = requireUserId(context);
      const isFinance = await isFinanceUser(authorization, userId);
      if (!isFinance) {
        return context.json(
          { code: 'FORBIDDEN', message: '只有财务/管理员可以审核报销单。' },
          403,
        );
      }
      const body = await context.req.json<{
        action?: unknown;
        reason?: unknown;
      }>();
      const action = body.action;
      if (action !== 'approve' && action !== 'reject') {
        return context.json(
          {
            code: 'INVALID_ACTION',
            message: '审核操作必须是 approve 或 reject。',
          },
          400,
        );
      }
      const result = await claims.review(
        context.req.param('id'),
        userId,
        action,
        typeof body.reason === 'string' ? body.reason : null,
      );
      return context.json({ data: result });
    });

    router.delete(
      '/expense-claims/:claimId/attachments/:attachmentId',
      async (context) => {
        const userId = requireUserId(context);
        const isFinance = await isFinanceUser(authorization, userId);
        const deleted = await claims.deleteAttachment(
          userId,
          isFinance,
          context.req.param('attachmentId'),
        );
        if (!deleted) {
          return context.json(
            { code: 'ATTACHMENT_NOT_FOUND', message: '附件不存在。' },
            404,
          );
        }
        return context.json({ data: { deleted: true } });
      },
    );

    return router;
  },
);

export const rootRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes((app: Application) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const fileManager = app.container.resolve(serverFileRepositoryManagerToken);
    const claims = app.container.resolve(expenseClaimServiceToken);
    const files = fileManager.repository('expense_claim_files', {
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/expense-claims',
    });

    router.use('/uploads/expense-claims', authentication.required());
    router.use('/uploads/expense-claims/*', authentication.required());

    router.get('/uploads/expense-claims/:file', async (context) => {
      const match =
        /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/.exec(
          context.req.param('file'),
        );
      if (!match) return context.notFound();
      const userId = requireUserId(context);
      const isFinance = await isFinanceUser(authorization, userId);
      const fileId = match[1];
      const ext = match[2] ?? '';
      const download = await claims.resolveDownload(fileId, userId, isFinance);
      if (!download) return context.notFound();
      const record = await files.findOne({ filter: { id: fileId } });
      if (!record || record.ext !== ext) return context.notFound();

      context.header('Cache-Control', 'private, no-store');
      context.header('Content-Type', download.mimeType);
      context.header('Content-Length', String(download.size));
      context.header('X-Content-Type-Options', 'nosniff');
      context.header('Content-Security-Policy', "sandbox; default-src 'none'");
      context.header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(download.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      );
      return context.body(download.stream);
    });

    router.onError((error, context) => {
      if (error instanceof ExpenseClaimValidationError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as ContentfulStatusCode,
        );
      }
      throw error;
    });

    return router;
  });

function requireUserId(context: Context): string {
  const typed = context as Context<{ Variables: AuthEnv['Variables'] }>;
  const auth = typed.get('auth');
  if (!auth) {
    throw new ExpenseClaimValidationError('UNAUTHENTICATED', '未登录。', 401);
  }
  return auth.user.id;
}

const routes: readonly AppRouteContribution<Application>[] = [
  apiRoutes,
  rootRoutes,
];

export default routes;
