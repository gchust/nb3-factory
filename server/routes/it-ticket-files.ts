import { Hono, type Context } from 'hono';

import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  defineFileRepositoryApiRoutes,
  type FileRepositoryApiExposure,
} from '@nocobase/app-plugin-file/server';

import { IT_TICKET_FILES_ACCESS_PATH } from '../providers/it-tickets/index.js';

/**
 * Screenshots and other attachments of an IT ticket.
 *
 * The file plugin owns the storage, the UUID-addressed byte route and the multipart upload; this file declares the
 * collection those bytes belong to and the Policy under which a signed-in user may upload and read metadata. The
 * bytes themselves are served only to a caller holding the record's UUID, which is why a ticket's detail response
 * hands out `contentUrl` only to someone the ticket service has already decided may see the ticket.
 */
export interface ItTicketFilePrincipal {
  readonly userId: string;
}

export const itTicketFileApiName = 'itTicketFiles';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** A multipart body adds boundaries and headers on top of the file itself. */
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;
const FILE_DOMAIN = 'itTicketFiles';

/**
 * The image format `bytes` begins with, by its magic number, or null when it is none this application accepts. The
 * declared `File.type` comes from the caller and a corrupt file can carry any of it, so the bytes are what count.
 */
function detectImageMime(bytes: Uint8Array): string | null {
  const at = (index: number): number => bytes[index] ?? -1;
  if (
    bytes.length >= 8 &&
    at(0) === 0x89 &&
    at(1) === 0x50 &&
    at(2) === 0x4e &&
    at(3) === 0x47 &&
    at(4) === 0x0d &&
    at(5) === 0x0a &&
    at(6) === 0x1a &&
    at(7) === 0x0a
  )
    return 'image/png';
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 6 &&
    (decodeAscii(bytes, 0, 6) === 'GIF87a' ||
      decodeAscii(bytes, 0, 6) === 'GIF89a')
  )
    return 'image/gif';
  if (
    bytes.length >= 12 &&
    decodeAscii(bytes, 0, 4) === 'RIFF' &&
    decodeAscii(bytes, 8, 4) === 'WEBP'
  )
    return 'image/webp';
  if (bytes.length >= 2 && at(0) === 0x42 && at(1) === 0x4d) return 'image/bmp';
  return null;
}

function decodeAscii(
  bytes: Uint8Array,
  offset: number,
  length: number,
): string {
  let value = '';
  for (let index = offset; index < offset + length; index += 1)
    value += String.fromCharCode(bytes[index] ?? 0);
  return value;
}

/** Whether a screenshot is one this application serves: a real raster image, by content. */
async function isSupportedAttachment(file: File): Promise<boolean> {
  const declared = file.type.trim().toLowerCase();
  if (declared && !declared.startsWith('image/')) return false;
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return detectImageMime(header) !== null;
}

/**
 * Reject anything that is not a real raster image before the file plugin stores it.
 *
 * The plugin accepts whatever the caller sends and records the caller's `type`, so a file declared `image/png` but
 * holding arbitrary bytes would be stored and later served. Reading the multipart body from a clone lets the check run
 * before a byte reaches storage while leaving the request itself intact for the plugin's own size limit and parser.
 */
async function validateAttachmentUpload(
  context: Context,
  next: () => Promise<void>,
): Promise<void> {
  const contentType = context.req.header('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('multipart/form-data;')) {
    await next();
    return;
  }
  const declaredLength = Number(context.req.header('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    throw new ApiError({
      status: 'INVALID_ARGUMENT',
      reason: 'BODY_TOO_LARGE',
      domain: FILE_DOMAIN,
      message: 'Upload request body is too large.',
      httpStatus: 413,
    });
  }
  let form: FormData;
  try {
    // Read a clone: the original stream stays untouched for the plugin's own size limit and body parser, which run
    // after this middleware. Reading the original here would leave it locked for both of them.
    form = await context.req.raw.clone().formData();
  } catch {
    // The plugin's own multipart error is the better answer for a malformed body.
    await next();
    return;
  }
  const files = form
    .getAll('file')
    .filter((candidate): candidate is File => candidate instanceof File);
  for (const file of files) {
    if (!(await isSupportedAttachment(file))) {
      throw new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: 'TICKET_UNSUPPORTED_ATTACHMENT',
        domain: FILE_DOMAIN,
        message:
          'Only PNG, JPEG, GIF, WebP or BMP screenshots can be uploaded.',
      });
    }
  }
  await next();
}

const exposure: FileRepositoryApiExposure<ItTicketFilePrincipal> = {
  name: itTicketFileApiName,
  collection: itTicketFileApiName,
  disk: 'local',
  accessPath: IT_TICKET_FILES_ACCESS_PATH,
  accessMode: 'stream',
  policy: (principal) => ({
    // A file is readable only to the person who uploaded it. The ticket service is what shows an attachment to the
    // ticket's other participants, and it does so from its own unrestricted repository.
    read: {
      scope: { uploaderId: principal.userId },
      fields: [
        'id',
        'filename',
        'ext',
        'mimeType',
        'size',
        'createdAt',
        'updatedAt',
      ],
    },
    create: {
      scope: true,
      defaults: { uploaderId: principal.userId },
    },
    update: false,
    delete: { scope: { uploaderId: principal.userId } },
  }),
  actions: {
    uploadOne: { maxSize: MAX_UPLOAD_BYTES },
  },
};

/**
 * The upload path must be authenticated before the plugin's own handler runs, and the plugin deliberately ships its
 * routes public. Wrapping its `/api` contribution in a router that owns the prefix is how that is added: the
 * `use` patterns name only this contribution's paths, so nothing registered after it is guarded.
 */
function withAuthentication(
  contribution: AppApiRouteContribution<Application>,
): AppApiRouteContribution<Application> {
  return {
    scope: 'api',
    createRouter: async (app) => {
      const inner = await contribution.createRouter(app);
      const outer = new Hono();
      const auth = app.container.resolve(authenticationToken);
      outer.use(`/${itTicketFileApiName}`, auth.required());
      outer.use(`/${itTicketFileApiName}/*`, auth.required());
      // Whether the bytes really are a screenshot is this application's call, not the file plugin's; check it after
      // the session is known and before the plugin's handler writes anything.
      outer.use(`/${itTicketFileApiName}/uploadOne`, validateAttachmentUpload);
      outer.use(`/${itTicketFileApiName}/uploadMany`, validateAttachmentUpload);
      outer.route('/', inner);
      return outer;
    },
  };
}

export function defineItTicketFileRoutes(): readonly AppRouteContribution<Application>[] {
  const contributions = defineFileRepositoryApiRoutes<ItTicketFilePrincipal>({
    principal: (context) => {
      const auth = (context as unknown as Context<AuthEnv>).get('auth');
      return { userId: auth?.user.id ?? '' };
    },
    repositories: [exposure],
  });

  return contributions.map((contribution) =>
    contribution.scope === 'api'
      ? withAuthentication(contribution)
      : contribution,
  );
}
