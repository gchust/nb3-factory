import type { Application } from '@nocobase/app-server/application';
import { bodyLimit } from 'hono/body-limit';

import {
  createFeatureRouter,
  jsonBody,
  labService,
  userId,
  type LabHono,
} from './lab-http.js';

/** 20 MB, identical to the service limit, enforced before the body is buffered. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Types that may be handed to the browser inline. Anything else — including
 * HTML, SVG, XML and script files, which execute in the document's origin —
 * is forced to a download.
 */
const INLINE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);
const INLINE_TEXT_TYPES = new Set(['text/plain', 'text/csv', 'text/markdown']);

function isInlineSafe(mimeType: string): boolean {
  const mime = mimeType.toLowerCase().split(';')[0].trim();
  return (
    mime === 'application/pdf' ||
    INLINE_IMAGE_TYPES.has(mime) ||
    INLINE_TEXT_TYPES.has(mime)
  );
}

function isTextual(mimeType: string): boolean {
  return INLINE_TEXT_TYPES.has(mimeType.toLowerCase().split(';')[0].trim());
}

/** RFC 5987 filename, with an ASCII fallback for clients that ignore `filename*`. */
function contentDisposition(filename: string, download: boolean): string {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const kind = download ? 'attachment' : 'inline';
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

function singleFile(value: unknown): File | null {
  // A multipart field is a single file or a list of them; the cast drops the `any` the narrowing
  // leaves behind so the check below is the only thing that reads the value.
  const candidate = (Array.isArray(value) ? value[0] : value) as unknown;
  return candidate instanceof File ? candidate : null;
}

/** `/api/lab/files` — attachment metadata and upload. */
export function createLabFileApiRouter(app: Application): LabHono {
  const router = createFeatureRouter();
  const service = labService(app);

  router.get('/', async (context) => {
    const caller = userId(context);
    const targetType = context.req.query('targetType') ?? '';
    const targetId = context.req.query('targetId') ?? '';
    if (!targetType || !targetId) {
      return context.json(
        {
          code: 'INVALID_INPUT',
          message: 'targetType and targetId are required.',
        },
        400,
      );
    }
    return context.json({
      data: await service.listFiles(caller, targetType, targetId),
    });
  });

  router.post(
    '/',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (context) =>
        context.json(
          {
            code: 'BODY_TOO_LARGE',
            message: 'The upload exceeds the 20 MB limit.',
          },
          413,
        ),
    }),
    async (context) => {
      const caller = userId(context);
      const contentType = context.req.header('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
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

      const file = singleFile(body.file);
      if (!file) {
        return context.json(
          {
            code: 'INVALID_FILE',
            message: 'Exactly one File field named "file" is required.',
          },
          400,
        );
      }

      const content = Buffer.from(await file.arrayBuffer());
      const created = await service.uploadFile(caller, {
        targetType: readString(body, 'targetType') ?? '',
        targetId: readString(body, 'targetId') ?? '',
        purpose: readString(body, 'purpose'),
        remark: readString(body, 'remark'),
        filename: file.name || 'upload.bin',
        mimeType: file.type || null,
        content,
      });
      return context.json({ data: created }, 201);
    },
  );

  router.patch('/:id', async (context) => {
    const caller = userId(context);
    const id = context.req.param('id');
    if (!UUID_PATTERN.test(id)) {
      return context.json(
        { code: 'NOT_FOUND', message: 'File not found.' },
        404,
      );
    }
    const updated = await service.updateFile(
      caller,
      id,
      await jsonBody(context),
    );
    return context.json({ data: updated });
  });

  router.delete('/:id', async (context) => {
    const caller = userId(context);
    const id = context.req.param('id');
    if (!UUID_PATTERN.test(id)) {
      return context.json(
        { code: 'NOT_FOUND', message: 'File not found.' },
        404,
      );
    }
    await service.deleteFile(caller, id);
    return context.json({ data: { id } });
  });

  return router;
}

/**
 * Root-scope `/lab-files/:id/content`.
 *
 * The file plugin ships a public byte route for records it stores on a disk;
 * this application stores attachment bytes in the database and deliberately
 * serves them through its own authenticated route instead, so a leaked URL is
 * not a way around the laboratory rules.
 *
 * The route is registered on the caller's router rather than returned as its
 * own sub-application, so the authentication middleware the caller installs on
 * `/lab-files/*` is ordered in front of it.
 */
export function registerLabFileContentRoutes(
  router: LabHono,
  app: Application,
): void {
  const service = labService(app);

  router.get('/lab-files/:id/content', async (context) => {
    const id = context.req.param('id');
    if (!UUID_PATTERN.test(id)) {
      return context.json(
        { code: 'NOT_FOUND', message: 'File not found.' },
        404,
      );
    }
    const caller = userId(context);
    const file = await service.readFile(caller, id);

    const download = context.req.query('download') === '1';
    const forced = !isInlineSafe(file.mimeType);
    const disposition = contentDisposition(file.filename, download || forced);
    const mimeType = forced
      ? 'application/octet-stream'
      : isTextual(file.mimeType)
        ? `${file.mimeType.split(';')[0].trim()}; charset=utf-8`
        : file.mimeType;

    context.header('Content-Type', mimeType);
    context.header('Content-Length', String(file.content.length));
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('Content-Disposition', disposition);
    context.header('Cache-Control', 'private, no-store');
    context.header('Referrer-Policy', 'no-referrer');
    if (forced) {
      context.header('Content-Security-Policy', "sandbox; default-src 'none'");
    }

    return context.body(new Uint8Array(file.content));
  });
}
