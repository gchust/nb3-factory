import type { Application } from '@nocobase/app-server/application';
import { defineHttpMiddleware } from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { ServiceProvider } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';

import {
  PROCUREMENT_FILE_ACCESS_PATH,
  ProcurementService,
  procurementServiceToken,
} from './procurement-service.js';

const FILE_ID_PATTERN =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[a-z0-9]{1,32})?$/;

/**
 * Registers the procurement service and guards the two surfaces the File
 * Repository does not protect itself:
 *
 * - the content route under `PROCUREMENT_FILE_ACCESS_PATH`, so a shared file
 *   link still requires the caller to be allowed to read the owning document;
 * - the upload actions, which accept files from any signed-in caller but must
 *   not accept anonymous traffic.
 *
 * The Content path is a root route, so this is registered as an application
 * HTTP middleware and runs before the route contribution that serves the bytes.
 */
export default class ProcurementProvider extends ServiceProvider<Application> {
  public readonly name = 'app/procurement';

  public override register(): void {
    this.app.container.singleton(
      procurementServiceToken,
      (container) =>
        new ProcurementService(container, this.app.publicBasePath ?? ''),
    );

    this.app.addHttpMiddleware(
      defineHttpMiddleware({
        name: 'app/procurement/file-access',
        register: (router) => {
          // Authentication is contributed by a plugin, so it is only present in
          // an application that registered one. Without it there is nothing to
          // authenticate against and the guards are not installed.
          if (!this.app.container.has(authenticationToken)) return;
          const auth = this.app.container.resolve(authenticationToken);
          const service = this.app.container.resolve(procurementServiceToken);

          const guard: MiddlewareHandler<AuthEnv> = async (context, next) => {
            const session = context.get('auth');
            if (!session) {
              return context.json({ code: 'UNAUTHORIZED' }, 401);
            }
            const match = FILE_ID_PATTERN.exec(context.req.path);
            if (!match) return context.notFound();
            const principal = await service.principal(
              session.user.id,
              session.user.name ?? session.user.id,
            );
            const allowed = await service.canReadFile(principal, match[1]);
            if (!allowed) {
              return context.json({ code: 'FORBIDDEN' }, 403);
            }
            await next();
          };

          router.use(
            `${PROCUREMENT_FILE_ACCESS_PATH}/*`,
            auth.required() as unknown as MiddlewareHandler,
            guard as unknown as MiddlewareHandler,
          );
          router.use(
            '/api/procurementFiles:uploadOne',
            auth.required() as unknown as MiddlewareHandler,
          );
          router.use(
            '/api/procurementFiles:uploadMany',
            auth.required() as unknown as MiddlewareHandler,
          );
        },
      }),
    );
  }
}
