import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import { Hono, type Context } from 'hono';

import {
  FILE_EXPOSURES,
  MAX_FILE_BYTES,
} from '../providers/delivery/constants.js';
import { DeliveryError } from '../providers/delivery/errors.js';
import { deliveryServiceToken } from '../providers/delivery/index.js';
import type { DeliveryService } from '../providers/delivery/service.js';

export interface FilePrincipal {
  readonly id: string;
  readonly name: string;
}

interface UploadEnv {
  Variables: { filePrincipal: FilePrincipal };
}

const UUID_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/i;

interface RequestContext {
  readonly req: { readonly raw: Request };
}

async function resolvePrincipal(
  auth: Auth,
  context: RequestContext,
): Promise<FilePrincipal | undefined> {
  const session = await auth.getSession(context.req.raw.headers);
  const user = session?.user;
  if (!user?.id) return undefined;
  const name =
    (typeof user.name === 'string' && user.name.trim()) || String(user.id);
  return { id: String(user.id), name };
}

function readPrincipal(context: RequestContext): FilePrincipal | undefined {
  const value = (context as unknown as { get(key: string): unknown }).get(
    'filePrincipal',
  );
  return value as FilePrincipal | undefined;
}

/**
 * The registered File plugin documents its upload and content routes as public,
 * so the application installs its own authentication and record-level
 * authorization in front of them:
 *
 * - every upload action requires a signed-in session, and the session is
 *   published on the request context so the Repository policy can stamp the
 *   uploader onto the new row;
 * - every content request re-checks the business record the file is linked to,
 *   so revoking access or deleting the record invalidates an old link at once.
 *
 * Both contributions must be registered before the plugin's own routes.
 */
export const fileGuardRoutes: readonly AppRouteContribution<Application>[] = [
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const routes = new Hono<UploadEnv>();
    for (const exposure of FILE_EXPOSURES) {
      routes.use(`/${exposure.resource}:*`, async (context, next) => {
        const principal = await resolvePrincipal(auth, context);
        if (!principal) {
          return context.json(
            { code: 'UNAUTHENTICATED', message: 'Sign in to upload files.' },
            401,
          );
        }
        context.set('filePrincipal', principal);
        await next();
      });
    }
    const router = new Hono();
    router.route('/', routes);
    return router;
  }),
  defineRootRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const delivery =
      app.container.resolve<DeliveryService>(deliveryServiceToken);
    const routes = new Hono();
    for (const exposure of FILE_EXPOSURES) {
      routes.use(`${exposure.accessPath}/*`, async (context, next) => {
        const match = UUID_PATTERN.exec(
          context.req.path.slice(context.req.path.lastIndexOf('/') + 1),
        );
        if (!match) return context.notFound();
        const principal = await resolvePrincipal(auth, context);
        if (!principal) {
          return context.json(
            { code: 'UNAUTHENTICATED', message: 'Sign in to read this file.' },
            401,
          );
        }
        try {
          const actor = await delivery.contextFor(principal.id, principal.name);
          await delivery.assertFileReadable(
            actor.actor,
            exposure.kind,
            match[1],
          );
        } catch (error) {
          if (error instanceof DeliveryError) {
            return context.json(
              { code: error.code, message: error.message },
              error.status,
            );
          }
          throw error;
        }
        await next();
      });
    }
    return routes;
  }),
];

export const fileRepositoryRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes<FilePrincipal>({
    // The plugin already refuses an upload when this resolves to nothing.
    principal: ((context: Context) => readPrincipal(context)) as unknown as (
      context: Context,
    ) => FilePrincipal,
    repositories: FILE_EXPOSURES.map((exposure) => ({
      name: exposure.resource,
      collection: exposure.collection,
      connection: 'main',
      disk: 'local',
      accessPath: exposure.accessPath,
      accessMode: 'stream' as const,
      actions: { uploadOne: { maxSize: MAX_FILE_BYTES } },
      policy: (principal: FilePrincipal) => ({
        // Metadata reads go through the application's own delivery API, which
        // narrows them by contract scope; the public content route is guarded
        // above instead of by this policy.
        read: false,
        create: {
          scope: true,
          defaults: {
            uploadedById: principal.id,
            uploadedByName: principal.name,
          },
        },
        update: false,
        delete: false,
      }),
    })),
  });
