import type { Application } from '@nocobase/app-server/application';
import { defineHttpMiddleware } from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  ticketServiceToken,
  type TicketService,
} from '../service/ticket-service.js';

/**
 * Guards the repair-attachment surface of the equipment service application.
 *
 * The file plugin serves `<accessPath>/<uuid>.<ext>` as a public root route and
 * exposes its upload endpoints the same way, so the only way to keep a repair
 * attachment private is middleware registered before every router.
 *
 * It has to live at composition time rather than in a service provider: the
 * application becomes route-immutable the moment it starts, and providers are
 * registered inside `start()`. `server/app.ts` adds these next to the other
 * middleware it composes.
 *
 * Both middlewares are deliberately narrow. They claim only the exact paths the
 * equipment service owns and let everything else through untouched.
 */
export const equipmentServiceAttachmentAuthMiddleware =
  defineHttpMiddleware<Application>({
    name: 'app/equipment-service-attachment-auth',
    register: (router, app) => {
      router.use('/api/ticketAttachments/*', async (context, next) => {
        const auth = app.container.resolve(authenticationToken);
        const session = await auth.getSession(
          new Headers(context.req.raw.headers),
        );
        if (!session) {
          return context.json(
            {
              errors: [
                {
                  message: 'Sign in before uploading a repair attachment.',
                  code: 'UNAUTHENTICATED',
                },
              ],
            },
            401,
          );
        }
        await next();
      });
    },
  });

export const equipmentServiceFileGuardMiddleware =
  defineHttpMiddleware<Application>({
    name: 'app/equipment-service-file-guard',
    register: (router, app) => {
      router.use('/uploads/tickets/*', async (context, next) => {
        const last = context.req.path.split('/').pop() ?? '';
        // The byte route addresses `<record id>.<ext>`, so the guard checks
        // that id rather than the storage key.
        const id =
          /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(
            last,
          )?.[1];
        const auth = app.container.resolve(authenticationToken);
        const session = await auth.getSession(
          new Headers(context.req.raw.headers),
        );
        if (!session) {
          return context.json(
            {
              errors: [
                { message: 'Authentication required', code: 'UNAUTHENTICATED' },
              ],
            },
            401,
          );
        }
        if (!id) {
          return context.notFound();
        }
        const tickets =
          app.container.resolve<TicketService>(ticketServiceToken);
        const allowed = await tickets.canViewFileId(id, session.user.id);
        if (!allowed) {
          return context.json(
            {
              errors: [
                {
                  message: 'You may not read this attachment',
                  code: 'FORBIDDEN',
                },
              ],
            },
            403,
          );
        }
        await next();
      });
    },
  });
