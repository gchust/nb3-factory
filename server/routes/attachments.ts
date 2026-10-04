import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { RepositoryPolicy } from '@nocobase/db';
import { Hono, type Context } from 'hono';

/**
 * The upload endpoint for material attachments.
 *
 * The bytes, the `objects/<uuid>` key, the metadata row and the File Repository's collection validation all come
 * from `@nocobase/app-plugin-file`; this module only says which exposure is open and who may use it. The upload is
 * an ordinary File Repository `uploadOne` action, reachable as `POST /api/materialFiles:uploadOne`, and the returned
 * record already carries a `contentUrl`.
 *
 * The plugin's routes are "application-owned" by design: it ships no authentication. It is wrapped here so that
 * `auth.required()` runs on the one path this application exposes before the plugin's own router sees the request,
 * and so the plugin's public byte route (which serves anyone holding a UUID) is never mounted. The authenticated
 * byte route lives in `material-content.ts`.
 */
const NAME = 'materialFiles';
const COLLECTION = 'material_files';
const ACCESS_PATH = '/uploads/materials';

/** The file columns the Plugin's upload path binds as the create allowlist; kept in step with the fixed file columns. */
const FILE_COLUMNS = [
  'id',
  'disk',
  'key',
  'filename',
  'ext',
  'mimeType',
  'size',
  'createdAt',
  'updatedAt',
] as const;

interface Principal {
  readonly id: string;
}

/** Every row this principal may read or produce belongs to them, and every upload is stamped with their id. */
const policy = (principal: Principal): RepositoryPolicy => ({
  read: { scope: { ownerId: principal.id }, fields: [...FILE_COLUMNS] },
  create: {
    scope: { ownerId: principal.id },
    defaults: { ownerId: principal.id },
  },
  update: false,
  delete: false,
});

const [pluginApiRoute] = defineFileRepositoryApiRoutes<Principal>({
  principal: (context) => {
    const session = (context as Context<AuthEnv>).get('auth');
    return session ? { id: session.user.id } : null!;
  },
  repositories: [
    {
      name: NAME,
      collection: COLLECTION,
      disk: 'local',
      accessPath: ACCESS_PATH,
      policy,
      actions: { uploadOne: { maxSize: 20 * 1024 * 1024 } },
    },
  ],
});

export default defineApiRoutes(async (app: Application) => {
  const router = new Hono<AuthEnv>();
  const auth = app.container.resolve(authenticationToken);

  // Scoped to the exact action path this application exposes: no wildcard, so nothing the plugin may add later is
  // authenticated by accident, and no other contribution's path is affected.
  router.use(`/${NAME}:uploadOne`, auth.required());
  router.route('/', await pluginApiRoute.createRouter(app));

  // `defineApiRoutes` returns a plain `Hono`; the typed router is mounted into one so the
  // handlers keep their `AuthEnv` context (`context.get('auth')`) without widening it away.
  const root = new Hono();
  root.route('/', router);
  return root;
});
