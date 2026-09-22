import type { Application } from '@nocobase/app-server/application';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AppRouteContribution } from '@nocobase/app-server/router';

/**
 * `defineFileRepositoryApiRoutes` builds its router at module load, before an
 * Application exists, but a Policy that reads the principal runs per request.
 * The provider calls `configureServiceFiles(app)` during boot so the resolver
 * below can reach the container.
 */
let application: Application | undefined;

export function configureServiceFiles(app: Application): void {
  application = app;
}

type Principal = { id: string } | undefined;

/**
 * The Repository routes enforce only the Policy, never a session. This exposure
 * therefore denies everything to an anonymous caller and allows an
 * authenticated one to read and create file metadata. The bytes themselves are
 * served by the application-owned, record-scoped route
 * `GET /api/service/files/:id/content`, and the plugin's public byte route is
 * deliberately not mounted.
 */
const contributions: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes<Principal>({
    principal: async (context) => {
      if (!application) return undefined;
      const auth = application.container.resolve(authenticationToken);
      const session = await auth.getSession(context.req.raw.headers);
      return session ? { id: String(session.user.id) } : undefined;
    },
    repositories: [
      {
        name: 'serviceFiles',
        collection: 'serviceFiles',
        disk: 'local',
        policy: (principal: Principal) =>
          principal
            ? { read: true, create: true, update: false, delete: false }
            : { read: false, create: false, update: false, delete: false },
        actions: {
          findOne: {},
          findMany: { maxLimit: 100 },
          uploadOne: {},
          uploadMany: {},
        },
      },
    ],
  }).slice(0, 1);

export default contributions;
