/**
 * Guards the file plugin's intentionally-public attachment paths.
 *
 * The File Repository API and its byte route are public by design: mounting
 * them authenticates nothing. Because plugin routes are mounted before the
 * application's own route contributions, the guard has to be an application
 * HTTP middleware — those register before every route — rather than another
 * contribution, which would end up behind the routes it is meant to protect.
 *
 * The byte route under `/service-attachments/*` stays reachable only for a
 * signed-in session. Business reads of an attachment additionally go through
 * `GET /api/service/attachments/:id/content`, which checks the caller's access
 * to the work order the file belongs to.
 */
import type { Application } from '@nocobase/app-server/application';
import { defineHttpMiddleware } from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import type { MiddlewareHandler } from 'hono';

export const serviceAttachmentGuard = defineHttpMiddleware<Application>({
  name: 'app/service-attachments',
  register(router, app) {
    // The authentication service is resolved per request rather than once at
    // registration: a runtime assembled without it (a harness that never boots
    // the authentication plugin) must still register its routes, and a request
    // that arrives without a usable session is rejected rather than let through.
    const authenticate: MiddlewareHandler<AuthEnv> = async (context, next) => {
      if (!app.container.has(authenticationToken)) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication is not available' },
          401,
        );
      }
      return app.container.resolve(authenticationToken).required()(
        context,
        next,
      );
    };
    router.use('/api/serviceWorkOrderFiles:uploadOne', authenticate);
    router.use('/service-attachments/*', authenticate);
  },
});

export default serviceAttachmentGuard;
