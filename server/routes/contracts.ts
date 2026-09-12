import { Readable } from 'node:stream';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { FileRepositoryError } from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  ContractError,
  contractsServiceToken,
  type ContractSaveInput,
} from '../providers/contracts.js';

/** Request body cap for a single 5 MiB body PDF plus multipart overhead. */
const SINGLE_UPLOAD_LIMIT = 8 * 1024 * 1024;
/** Request body cap for an attachment batch (each file still capped at 5 MiB). */
const BATCH_UPLOAD_LIMIT = 64 * 1024 * 1024;

/**
 * Business endpoints of the contract archive, mounted under `/api`.
 *
 * Every path requires a signed-in session (`auth.required()`), including the
 * upload endpoints — these are the authoritative file-admission gate, so they
 * must never be reachable anonymously.
 */
export const contractsApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(contractsServiceToken);

    router.use('*', auth.required());

    router.post(
      '/contracts:list',
      respond(() => service.list()),
    );
    router.post(
      '/contracts:get',
      respond(async (context) => {
        const { filter } = await readJsonBody(context.req);
        return service.get(readId(filter));
      }),
    );
    router.post(
      '/contracts:create',
      respond(async (context) => {
        const { values } = await readJsonBody(context.req);
        return service.create(readSaveInput(values));
      }),
    );
    router.post(
      '/contracts:update',
      respond(async (context) => {
        const { filter, values } = await readJsonBody(context.req);
        return service.update(readId(filter), readSaveInput(values));
      }),
    );
    router.post(
      '/contracts:delete',
      respond(async (context) => {
        const { filter } = await readJsonBody(context.req);
        const id = readId(filter);
        await service.delete(id);
        return { id };
      }),
    );
    router.post(
      '/contracts:deleteAttachment',
      respond(async (context) => {
        const { filter } = await readJsonBody(context.req);
        await service.deleteAttachment(readId(filter), readFileId(filter));
        return { success: true };
      }),
    );
    router.post(
      '/contracts:uploadBody',
      bodyLimit({ maxSize: SINGLE_UPLOAD_LIMIT }),
      respond(async (context) => {
        const { file } = await context.req.parseBody({ all: true });
        if (!(file instanceof File)) {
          throw new ContractError(
            'CONTRACT_UPLOAD_FILE_REQUIRED',
            '请选择要上传的正文 PDF 文件。',
          );
        }
        return service.uploadBody(file);
      }),
    );
    router.post(
      '/contracts:uploadAttachments',
      bodyLimit({ maxSize: BATCH_UPLOAD_LIMIT }),
      respond(async (context) => {
        const body = await context.req.parseBody({ all: true });
        // Accept both the multi-field convention (`files`) and the
        // single-field convention (`file`) used by the file upload control,
        // which uploads each selected attachment through `uploadOne`.
        const fileList = [
          ...collectFormFiles(body.files),
          ...collectFormFiles(body.file),
        ];
        return service.uploadAttachments(fileList);
      }),
    );
    /**
     * Inline content stream used by the preview dialog and download links.
     * The File plugin's own content route answers with `Content-Disposition:
     * attachment`, which forces a download instead of letting the browser
     * render a PDF inside the preview iframe. This route serves the same
     * object inline with its real content type, so previews work.
     */
    router.get('/contracts:fileContent/:id', (context) =>
      streamFileContent(context, app),
    );

    return router;
  });

/** Serves the stored object with `Content-Disposition: inline`. */
async function streamFileContent(
  context: Context,
  app: Application,
): Promise<Response> {
  try {
    const fileId = String(context.req.param('id') ?? '');
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        fileId,
      )
    ) {
      return context.notFound();
    }
    const service = app.container.resolve(contractsServiceToken);
    const record = await service.findFileRecord(fileId);
    if (!record) return context.notFound();
    const drive = app.container.resolve(driveManagerToken);
    const disk = drive.use(record.disk);
    if (!(await disk.exists(record.key))) return context.notFound();
    context.header(
      'Content-Type',
      record.mimeType || 'application/octet-stream',
    );
    context.header('Content-Length', String(record.size));
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('Cache-Control', 'private, no-store');
    context.header(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(record.filename).replace(
        /['()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      )}`,
    );
    return context.body(Readable.toWeb(await disk.getStream(record.key)));
  } catch (error) {
    if (error instanceof FileRepositoryError) {
      return context.json({ code: error.code, message: error.message }, 404);
    }
    console.error('[contracts] file content failed:', error);
    return context.json(
      { code: 'INTERNAL_ERROR', message: '文件读取失败。' },
      500,
    );
  }
}

function respond(handler: (context: Context) => Promise<unknown>) {
  return async (context: Context): Promise<Response> => {
    try {
      const data = await handler(context);
      return context.json({ data });
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

async function readJsonBody(
  req: Context['req'],
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new ContractError('CONTRACT_BODY_INVALID', '请求数据格式不正确。');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ContractError('CONTRACT_BODY_INVALID', '请求数据格式不正确。');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Collects every File value carried by a single multipart field name.
 *
 * `parseBody` keeps a field as a bare `File` when it occurs once and turns it
 * into an array when the same name occurs more than once, so both shapes are
 * handled. Exported for unit tests; the multipart round-trip itself is
 * covered by the running-server verification.
 */
export function collectFormFiles(value: unknown): File[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is File => item instanceof File);
  }
  return value instanceof File ? [value] : [];
}

function readId(filter: unknown): number {
  const id = Number((filter as { id?: unknown } | undefined)?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ContractError('CONTRACT_ID_INVALID', '合同编号参数不正确。');
  }
  return id;
}

function readFileId(filter: unknown): string {
  const fileId = (filter as { fileId?: unknown } | undefined)?.fileId;
  if (typeof fileId !== 'string' || !fileId) {
    throw new ContractError('CONTRACT_FILE_ID_INVALID', '附件参数不正确。');
  }
  return fileId;
}

function readSaveInput(values: unknown): ContractSaveInput {
  if (typeof values !== 'object' || values === null) {
    throw new ContractError('CONTRACT_VALUES_REQUIRED', '合同数据不能为空。');
  }
  return values as ContractSaveInput;
}
