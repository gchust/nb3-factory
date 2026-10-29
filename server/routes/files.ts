import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { databaseManagerToken } from '@nocobase/db';
import { getRequestLocale, getRequestTranslator } from '@nocobase/i18n/server';
import { Hono, type Context } from 'hono';

import { ticketServiceToken } from '../providers/helpdesk.js';
import { ticketPolicyFor } from '../tickets/service.js';

interface FilePrincipal {
  readonly id: string;
}

type FileEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

type FileContext = Context<FileEnv, string>;

const fileNotFound = (context: unknown): ApiError => {
  const request = context as FileContext;
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'FILE_NOT_FOUND',
    domain: 'file',
    message: 'The file was not found.',
    localizedMessage: {
      locale: getRequestLocale(request) ?? 'en-US',
      message: getRequestTranslator(
        request,
        'nb3-factory',
      )('helpdesk.errors.fileNotFound'),
    },
  });
};

/**
 * File metadata and uploads for ticket attachments. The generated file routes
 * are public by contract, so each contribution is wrapped with the session and
 * the ticket permission that owns it: uploads need `attach`, reads need `view`.
 * Uploads stamp the caller as the owner so an unlinked upload can be previewed;
 * another user reads it only after the file is linked to a ticket they can see.
 */
const generated = defineFileRepositoryApiRoutes<FilePrincipal>({
  principal: (context) => {
    const auth = context.get('auth') as { user?: { id?: string } } | undefined;
    return { id: auth?.user?.id ?? '' };
  },
  repositories: [
    {
      name: 'ticketFiles',
      collection: 'ticket_files',
      disk: 'local',
      accessPath: '/uploads/tickets',
      accessMode: 'stream',
      policy: (principal) => ({
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
        create: {
          scope: true,
          defaults: { ownerId: principal.id },
        },
        update: false,
        delete: false,
      }),
      actions: {
        uploadOne: { maxSize: 10 * 1024 * 1024 },
        uploadMany: { maxSize: 20 * 1024 * 1024 },
      },
    },
  ],
});

export const fileRoutes: readonly AppRouteContribution<Application>[] =
  generated.map((contribution) => {
    const createRouter = async (app: Application) => {
      const auth = app.container.resolve(authenticationToken);
      const authz = app.container.resolve(authorizationToken);
      const tickets = app.container.resolve(ticketServiceToken);
      const database = app.container.resolve(databaseManagerToken);
      const inner = await contribution.createRouter(app);
      const guarded = new Hono<{
        Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
      }>();
      const path =
        contribution.scope === 'api' ? '/ticketFiles/*' : '/uploads/tickets/*';

      guarded.onError(apiErrorHandler);
      guarded.use(path, auth.required(), authz.middleware());
      guarded.use(path, async (context, next) => {
        if (contribution.scope === 'api') {
          const decision = await context.get('authz').authorize({
            resource: { type: 'composite', id: 'helpdesk.tickets' },
            action: 'attach',
          });
          if (decision.effect === 'deny') {
            throw new AuthorizationDeniedError(decision);
          }
          await next();
          return;
        }

        const decision = await context.get('authz').authorize({
          resource: { type: 'composite', id: 'helpdesk.tickets' },
          action: 'view',
        });
        if (decision.effect === 'deny') {
          throw new AuthorizationDeniedError(decision);
        }

        const fileId =
          context.req.path.split('/').filter(Boolean).pop()?.split('.')[0] ??
          '';
        const file = await database
          .connection()
          .repository<{ id: string; ownerId: string | null }>('ticket_files')
          .findOne({ filter: { id: fileId } });
        if (!file) throw fileNotFound(context);

        const actorId = context.get('auth')?.user?.id;
        if (file.ownerId !== actorId) {
          const linked = await tickets.ticketForAttachment(fileId);
          if (!linked) throw fileNotFound(context);
          const visible = await tickets.requireTicket(
            ticketPolicyFor(decision),
            linked.ticket.id,
          );
          if (!visible) throw fileNotFound(context);
        }

        await next();
      });
      guarded.route('/', inner);
      const router = new Hono();
      router.route('/', guarded);
      return router;
    };
    return contribution.scope === 'api'
      ? { scope: 'api' as const, createRouter }
      : { scope: 'root' as const, createRouter };
  });
