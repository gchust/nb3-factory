import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { defineHttpMiddleware } from '@nocobase/app-server/router';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import { databaseManagerToken } from '@nocobase/db';

import { ServiceAccess } from '../service/access.js';
import { visibleTicketIds } from '../service/visibility.js';
import type { TicketAttachment } from '../service/domain.js';

/**
 * The ticket attachment exposure. `ticket_files` is the App-owned file
 * collection created by the service migration; bytes live on the local disk.
 */
export const TICKET_FILES_RESOURCE = 'ticketFiles';
export const TICKET_FILES_ACCESS_PATH = '/uploads/ticket-files';

export const ticketFileRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: TICKET_FILES_RESOURCE,
        collection: 'ticket_files',
        disk: 'local',
        accessPath: TICKET_FILES_ACCESS_PATH,
        accessMode: 'stream',
        policy: {
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
          create: { scope: true },
          update: false,
          delete: { scope: true },
        },
        actions: {
          findMany: { maxLimit: 100 },
          findOne: {},
          deleteOne: {},
          uploadOne: { maxSize: 10 * 1024 * 1024 },
        },
      },
    ],
  });

const API_ACTIONS: Readonly<Record<string, string>> = {
  findMany: 'view',
  findOne: 'view',
  deleteOne: 'update',
  uploadOne: 'update',
};

/**
 * Authentication and authorization for the file exposure, which the file
 * plugin deliberately leaves to the application. The content route is the
 * important one: a caller who guesses a UUID still has to hold a ticket the
 * file is attached to.
 *
 * The check refuses only an explicit `deny`. A permission set that grants the
 * action through the service composites resolves to `conditional`, and
 * `require()` would reject that as well.
 */
export const ticketFileGuard = defineHttpMiddleware<Application>({
  name: 'app/ticket-file-guard',
  register(router, app) {
    // The guard needs the authentication and authorization services. A runtime
    // that composes providers without those plugins (as some focused tests do)
    // has no session and no permission model to enforce, so there is nothing to
    // guard and the middleware is not installed.
    if (
      !app.container.has(authenticationToken) ||
      !app.container.has(authorizationToken)
    ) {
      return;
    }
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const access = new ServiceAccess(authorization);

    for (const [action, permission] of Object.entries(API_ACTIONS)) {
      router.use(
        `/api/${TICKET_FILES_RESOURCE}:${action}`,
        auth.required(),
        authorization.middleware(),
        async (context, next) => {
          const decision = await context.get('authz').authorize({
            resource: { type: 'composite', id: 'service.tickets' },
            action: permission,
          });
          if (decision.effect === 'deny') {
            return context.json(
              { code: 'FORBIDDEN', message: 'Not allowed' },
              403,
            );
          }
          await next();
        },
      );
    }

    router.use(
      `${TICKET_FILES_ACCESS_PATH}/*`,
      auth.required(),
      authorization.middleware(),
      async (context, next) => {
        const user = context.get('auth')?.user;
        if (!user) return context.json({ code: 'UNAUTHENTICATED' }, 401);
        // The middleware is mounted with a wildcard, so the file name comes from
        // the path rather than a route parameter.
        const file = context.req.path.split('/').pop() ?? '';
        const id = file.split('.')[0];
        if (!id) return context.json({ code: 'NOT_FOUND' }, 404);
        const database = app.container.resolve(databaseManagerToken);
        const links =
          (await database
            .repository<TicketAttachment>('ticket_attachments')
            .findMany()) ?? [];
        const ticketIds = [
          ...new Set(
            links
              .filter((link) => link.fileId === id)
              .map((link) => link.ticketId),
          ),
        ];
        if (ticketIds.length === 0) {
          return context.json({ code: 'NOT_FOUND' }, 404);
        }
        const actor = await access.actor(user.id);
        const scope = await visibleTicketIds(database, actor);
        if (scope.kind === 'none') {
          return context.json({ code: 'NOT_FOUND' }, 404);
        }
        const allowed =
          scope.kind === 'all' ||
          ticketIds.some((ticketId) => scope.ids.includes(ticketId));
        if (!allowed) {
          return context.json({ code: 'NOT_FOUND' }, 404);
        }
        await next();
      },
    );
  },
});
