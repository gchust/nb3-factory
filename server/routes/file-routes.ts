import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import { Hono, type Context } from 'hono';

import { ticketServiceToken } from '../providers/ticket-service.js';

/**
 * Where the attachment bytes are served, outside `/api`.
 *
 * The path is the file plugin's contract and must match the `accessPath` the exposure below declares. It is written
 * once here so the exposure and the ownership check cannot drift apart.
 */
const ATTACHMENT_ACCESS_PATH = '/uploads/ticketAttachments';

/** The Client resource name for the exposure; the upload field and the preview dialog use it. */
const ATTACHMENT_RESOURCE = 'ticketAttachments';

type AttachmentEnv = AuthEnv & AuthorizationEnv;

/**
 * The ticket attachments: issue screenshots and the images an engineer adds while handling a ticket.
 *
 * The file plugin owns upload, storage and metadata; this application owns the collection, the disk, the exposure and
 * — because the plugin's routes carry no authentication of their own — the security in front of them. Upload metadata
 * is reachable only by a signed-in caller who may see tickets at all, and the bytes are reachable only by the caller who
 * uploaded the file or by someone who can see a ticket that names it.
 */
const exposures: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({
    // The upload's `create.defaults` stamps this on every uploaded row, and the bytes route compares it with the session.
    // The plugin types its context as the bare Hono `Context`, so the variable is read through this application's own
    // environment rather than through an `any`.
    principal: (context) => {
      const auth = (context as Context<AttachmentEnv>).get('auth');
      return auth?.user?.id ?? '';
    },
    repositories: [
      {
        name: ATTACHMENT_RESOURCE,
        collection: 'ticket_files',
        disk: 'local',
        accessPath: ATTACHMENT_ACCESS_PATH,
        // Stream, never redirect: the local disk has no public URL and this application's files are not public.
        accessMode: 'stream',
        policy: (ownerId: string) => ({
          // A file id is an opaque UUID that only the ticket or the page that uploaded it knows. Scope is not narrowed
          // further because the association runs the other way — `tickets.attachmentId` names the file — so the bytes
          // route below is where ownership is actually decided.
          read: {
            scope: true,
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
          // Uploading a screenshot happens before the ticket exists, so creation cannot depend on an existing ticket; the
          // uploader is stamped onto the row instead, which is what lets them preview it in the form.
          create: { scope: true, defaults: { ownerId } },
          // Metadata is never edited: replacing a file means uploading a new one and pointing the ticket at it.
          update: false,
          // Deleting is the service desk's job in a later release; nothing here may remove evidence about a ticket.
          delete: false,
        }),
        actions: {
          findOne: {},
          uploadOne: { maxSize: 5 * 1024 * 1024 },
          uploadMany: { maxSize: 20 * 1024 * 1024 },
        },
      },
    ],
  });

/** Wraps one plugin contribution so this application's authentication runs before anything it answers. */
function guard(
  contribution: AppRouteContribution<Application>,
  app: Application,
): Promise<Hono> | Hono {
  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const tickets = app.container.resolve(ticketServiceToken);
  const router = new Hono();
  const scoped = new Hono<AttachmentEnv>();

  if (contribution.scope === 'api') {
    // Metadata: a signed-in caller who may view tickets at all. The rows themselves are keyed by an unguessable id.
    scoped.use(
      `/${ATTACHMENT_RESOURCE}/*`,
      auth.required(),
      authorization.middleware(),
      async (context, next) => {
        const allowed = await context.get('authz').can({
          resource: { type: 'composite', id: 'tickets' },
          action: 'view',
        });
        if (!allowed) {
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'TICKET_ATTACHMENT_DENIED',
            domain: 'tickets',
            message: 'The current identity may not read ticket attachments.',
          });
        }
        await next();
      },
    );
  } else {
    // Bytes: the file name is `<fileId>.<ext>`, so the check happens before the plugin looks the record up.
    scoped.use(
      `${ATTACHMENT_ACCESS_PATH}/*`,
      auth.required(),
      authorization.middleware(),
      async (context, next) => {
        const user = context.get('auth')?.user;
        if (!user) {
          throw new ApiError({
            status: 'UNAUTHENTICATED',
            reason: 'AUTHENTICATION_REQUIRED',
            domain: 'tickets',
            message: 'Ticket attachments need a signed-in session.',
          });
        }
        const file = context.req.path.slice(
          context.req.path.lastIndexOf('/') + 1,
        );
        const fileId = file.split('.')[0] ?? '';
        const actor = {
          id: String(user.id),
          name: String(user.name ?? user.email ?? user.id),
        };
        if (
          !(await tickets.canReadAttachment(
            context.get('authz'),
            actor,
            fileId,
          ))
        ) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'TICKET_ATTACHMENT_NOT_FOUND',
            domain: 'tickets',
            message: 'No ticket visible to the caller carries this attachment.',
          });
        }
        await next();
      },
    );
  }

  return Promise.resolve(contribution.createRouter(app)).then((inner) => {
    scoped.route('/', inner);
    router.route('/', scoped);
    return router;
  });
}

/**
 * The file contributions, each wrapped in the authentication and authorization this application requires.
 *
 * The plugin's own routes answer errors in the standard `/api` body through the application's handler; the wrapper
 * only adds middleware, so their documented shapes stay what the API document describes.
 */
export const ticketFileRoutes = exposures.map(
  (contribution): AppRouteContribution<Application> => ({
    scope: contribution.scope,
    createRouter: (app: Application) => guard(contribution, app),
  }),
);

export default ticketFileRoutes;
