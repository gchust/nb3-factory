import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { MAX_INVOICE_SIZE } from '../expense/model.js';

/**
 * The Collection the invoice uploads are written to, and the one the metadata endpoints are named after. The Plugin
 * derives both the `/api/<name>/<action>` paths and the `<accessPath>/<id>.<ext>` content paths from this name.
 */
export const EXPENSE_INVOICE_REPOSITORY = 'expenseInvoiceFiles';

/** Where the invoice bytes are served from. The client rebuilds a content URL as `<prefix>/<id>.<ext>`. */
export const EXPENSE_INVOICE_ACCESS_PATH = '/uploads/expenseInvoices';

const invoiceExposure = {
  name: EXPENSE_INVOICE_REPOSITORY,
  collection: EXPENSE_INVOICE_REPOSITORY,
  disk: 'local',
  accessPath: EXPENSE_INVOICE_ACCESS_PATH,
  accessMode: 'stream' as const,
  /*
   * Upload only.
   *
   * `read`, `update` and `delete` are false because the File Plugin's Policy cannot express this application's rule:
   * an invoice may be read by the applicant, the manager of the claim's department and finance, which means a filter
   * over a relation the Plugin has no way to write (`expenseItems.invoiceId` -> `expenseClaims`). Leaving `read` open
   * would list and serve every invoice in the application to every signed-in user, so it is closed instead, and the
   * detail page shows an invoice by building its content URL from the ids it already has.
   *
   * `create.scope: true` because an upload supplies no caller fields at all: the Plugin composes `disk`, `key`,
   * `filename`, `ext`, `mimeType` and `size` itself, so there is nothing for a field allowlist to constrain.
   */
  policy: {
    read: false as const,
    create: { scope: true as const },
    update: false as const,
    delete: false as const,
  },
  actions: {
    uploadOne: { maxSize: MAX_INVOICE_SIZE },
    uploadMany: { maxSize: MAX_INVOICE_SIZE },
  },
};

/**
 * The Plugin generates its routes without authentication: "Authentication and authorization are application-owned".
 * The content route in particular is otherwise public, keyed only by an unguessable UUID. Every path the exposure owns
 * is therefore wrapped in a session guard here, scoped to those exact prefixes — a contribution shares its mounted
 * router with every other contribution, so an unscoped `use('*')` would guard routes this module does not own.
 */
function guardedPaths(prefixes: readonly string[]): string[] {
  return prefixes.flatMap((prefix) => [`${prefix}/*`, prefix]);
}

function guardedRouter(
  prefixes: readonly string[],
  source: AppRouteContribution<Application>,
) {
  return async (app: Application) => {
    const router = new Hono();
    const required = app.container.resolve(authenticationToken).required();
    for (const path of guardedPaths(prefixes)) {
      router.use(path, required);
    }
    router.route('/', await source.createRouter(app));
    return router;
  };
}

function guardedApiContribution(
  source: AppApiRouteContribution<Application>,
  prefixes: readonly string[],
): AppApiRouteContribution<Application> {
  return defineApiRoutes(guardedRouter(prefixes, source));
}

function guardedRootContribution(
  source: AppRootRouteContribution<Application>,
  prefixes: readonly string[],
): AppRootRouteContribution<Application> {
  return defineRootRoutes(guardedRouter(prefixes, source));
}

/**
 * The invoice file exposure, with the session guard each generated route needs.
 *
 * The upload answers `{ data: { record, createdTargets } }` and the record's `contentUrl`. Neither the record nor the
 * URL is persisted on the claim: the claim stores `invoiceId` and `invoiceExt`, and the client rebuilds the URL, so a
 * change of base path or disk never invalidates stored data.
 */
const generated = defineFileRepositoryApiRoutes({
  repositories: [invoiceExposure],
  // No `principal`: every Policy above is static, and the upload route only resolves a principal for a Policy that
  // reads one. `authenticated` identity is established by the session guard instead.
});

export const expenseFileRoutes: readonly AppRouteContribution<Application>[] =
  generated.map((contribution) =>
    contribution.scope === 'api'
      ? guardedApiContribution(contribution, [`/${EXPENSE_INVOICE_REPOSITORY}`])
      : guardedRootContribution(contribution, [EXPENSE_INVOICE_ACCESS_PATH]),
  );
