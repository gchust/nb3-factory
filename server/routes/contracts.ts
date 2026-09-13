import { Readable } from 'node:stream';

import { FileRepositoryError } from '@nocobase/app-plugin-file/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  ContractError,
  contractsServiceToken,
  type ContractInput,
} from '../providers/contracts.js';

/** Multipart request cap: a 5 MiB attachment plus boundary overhead. */
const UPLOAD_LIMIT = 8 * 1024 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Contract archive endpoints, mounted under `/api`.
 *
 * Every path requires a signed-in session, including upload and content: these
 * are the authoritative file-admission gate and the only way to read a stored
 * attachment, so neither may be reachable anonymously.
 */
export const contractsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(contractsServiceToken);

    // Scope middleware to the paths this router owns. A `use('*')` would leak
    // into every contribution mounted at `/api`, including the authentication
    // plugin's `/api/auth/*` sign-in and sign-up routes.
    router.use('/contracts', auth.required());
    router.use('/contracts/*', auth.required());

    router.get(
      '/contracts',
      respond((context) => service.list(context.req.query('category'))),
    );
    router.get(
      '/contracts/:id',
      respond((context) => service.get(readIdParam(context))),
    );
    router.post(
      '/contracts',
      respond(async (context) =>
        service.create(await readContractInput(context)),
      ),
    );
    router.put(
      '/contracts/:id',
      respond(async (context) =>
        service.update(readIdParam(context), await readContractInput(context)),
      ),
    );
    router.post(
      '/contracts/attachments',
      bodyLimit({
        maxSize: UPLOAD_LIMIT,
        onError: (context) =>
          context.json(
            {
              code: 'CONTRACT_ATTACHMENT_TOO_LARGE',
              message: '附件不能超过 5 MiB。',
            },
            413,
          ),
      }),
      respond(async (context) => {
        const body = await context.req.parseBody({ all: true });
        const file = body.file;
        if (!(file instanceof File)) {
          throw new ContractError(
            'CONTRACT_ATTACHMENT_FILE_REQUIRED',
            '请选择要上传的附件文件。',
          );
        }
        return service.uploadAttachment(file);
      }),
    );
    router.get('/contracts/attachments/:id/content', (context) =>
      streamAttachment(context, app),
    );

    return router;
  });

/** Streams a stored attachment inline, or as a download when `?download=1`. */
async function streamAttachment(
  context: Context,
  app: Application,
): Promise<Response> {
  try {
    const fileId = String(context.req.param('id') ?? '');
    if (!UUID_PATTERN.test(fileId)) return context.notFound();
    const service = app.container.resolve(contractsServiceToken);
    const record = await service.findFileRecord(fileId);
    if (!record) return context.notFound();
    const drive = app.container.resolve(driveManagerToken);
    const disk = drive.use(record.disk);
    if (!(await disk.exists(record.key))) return context.notFound();

    const filename = encodeURIComponent(record.filename).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const download = context.req.query('download');
    context.header(
      'Content-Type',
      record.mimeType || 'application/octet-stream',
    );
    context.header('Content-Length', String(record.size));
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('Cache-Control', 'private, no-store');
    context.header(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${filename}`,
    );
    return context.body(Readable.toWeb(await disk.getStream(record.key)));
  } catch (error) {
    if (error instanceof FileRepositoryError) {
      return context.json({ code: error.code, message: error.message }, 404);
    }
    console.error('[contracts] attachment content failed:', error);
    return context.json(
      { code: 'INTERNAL_ERROR', message: '文件读取失败。' },
      500,
    );
  }
}

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
  if (error instanceof ContractError) {
    return context.json(
      { code: error.code, message: error.message },
      error.status as ContentfulStatusCode,
    );
  }
  if (error instanceof FileRepositoryError) {
    return context.json({ code: error.code, message: error.message }, 400);
  }
  console.error('[contracts] request failed:', error);
  return context.json(
    { code: 'INTERNAL_ERROR', message: '服务器内部错误，请稍后重试。' },
    500,
  );
}

function readIdParam(context: Context): number {
  const id = Number(context.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new ContractError('CONTRACT_ID_INVALID', '合同编号参数不正确。');
  }
  return id;
}

async function readContractInput(context: Context): Promise<ContractInput> {
  let parsed: unknown;
  try {
    parsed = await context.req.json();
  } catch {
    throw new ContractError('CONTRACT_BODY_INVALID', '请求数据格式不正确。');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ContractError('CONTRACT_BODY_INVALID', '请求数据格式不正确。');
  }
  return parsed;
}
