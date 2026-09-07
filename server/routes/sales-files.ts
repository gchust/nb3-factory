import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  authenticationConfig,
  type AuthSession,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
  type DatabaseAuthorizationConditions,
  type DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization';
import {
  createFileRoute,
  type FileRecord,
  type FileRouteAction,
} from '@nocobase/app-plugin-file';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { Hono, type Context } from 'hono';

import { createBusinessLicenseStore } from '../providers/sales-file-store.js';
import { resolveSalesIdentity } from '../providers/sales-identity.js';
import { compileFilter } from '../providers/sales-service.js';

const CUSTOMER_RESOURCE = {
  type: 'database.collection',
  id: 'main.customers',
} as const;

/**
 * Business-license attachment routes for customer profiles.
 *
 * The file plugin's route owns the upload/list/read/delete mechanics; this
 * contribution supplies the database scope (one profile's files) and an
 * authorizer that checks the profile's customer against the caller's
 * authorization conditions. Uploads and deletes require customer `update`;
 * listing and reading require customer `read`.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const drive = app.container.resolve(driveManagerToken);
    const authConfig = app.config.get(authenticationConfig);
    const tokenSecret = authConfig.secret;

    const fileRoutes = createFileRoute({
      drive,
      defaultDisk: 'local',
      // The app is mounted under a public base path (e.g. `/main`), so the
      // content URLs the file plugin builds must be prefixed with it or the
      // browser resolves them against the origin root and gets a 404.
      publicBasePath: app.publicBasePath,
      tokenSecret,
      audience: 'sales-business-license',
      auth: auth.required(),
      authorize: (context, action, file) =>
        authorizeFileAction(context, action, file, database, authz),
      // One business license per customer profile is a database constraint
      // (`business_license_files.customer_profile_id` is unique), so the store
      // replaces the previous file instead of inserting a second row.
      store: createBusinessLicenseStore(database, drive),
      visibility: { default: 'private', allowClientOverride: false },
      limits: {
        maxSize: 10 * 1024 * 1024,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      },
    });

    const router = new Hono();
    router.route(
      '/sales/customer-profiles/:profileId/business-license',
      fileRoutes,
    );
    return router;
  },
);

async function authorizeFileAction(
  context: Context,
  action: FileRouteAction,
  _file: FileRecord | undefined,
  database: DatabaseManager,
  authz: AppAuthorization,
): Promise<Response | void> {
  const profileId = Number(context.req.param('profileId'));
  if (!Number.isInteger(profileId)) {
    return context.json({ error: 'Invalid profile id.' }, 400);
  }
  const profile = await database
    .query()
    .selectFrom('customerProfiles')
    .select('customerId')
    .where('id', '=', profileId)
    .executeTakeFirst();
  if (!profile) {
    return context.json({ error: 'Customer profile not found.' }, 404);
  }
  const customerId = Number(profile.customerId);

  const session = context.get('auth') as AuthSession;
  if (!session) {
    return context.json({ error: 'Unauthenticated.' }, 401);
  }
  const identity = await resolveSalesIdentity(database, session.user.id);
  const scope = authz.for(identity);
  const actionName =
    action === 'upload' || action === 'delete' ? 'update' : 'read';
  const decision = await scope.authorize<DatabaseAuthorizationParams>({
    resource: CUSTOMER_RESOURCE,
    action: actionName,
    // No output fields are needed: the decision only supplies the record
    // access filter. Requesting output fields would fail for grants that
    // allow the action without an output field list (e.g. `update`).
    params: {},
  });
  if (
    decision.effect !== 'conditional' ||
    decision.conditions?.type !== 'database'
  ) {
    return context.json({ error: 'Forbidden.' }, 403);
  }
  const conditions = decision.conditions as DatabaseAuthorizationConditions;
  const customer = await database
    .query()
    .selectFrom('customers')
    .select('id')
    .where('id', '=', customerId)
    .where((eb) => compileFilter(eb, conditions.filter))
    .executeTakeFirst();
  if (!customer) {
    return context.json({ error: 'Forbidden.' }, 403);
  }
  return undefined;
}
