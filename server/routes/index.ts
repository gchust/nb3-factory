import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { apiRoutes as serviceRoutes } from './service.js';

/**
 * Every route contribution this application owns.
 *
 * The service routes are one API router under `/api`, including the attachment
 * content route. An attachment's bytes are served by that route, behind the
 * order's own read permission, rather than by the File plugin's public content
 * route: the plugin's route serves anyone holding the file UUID, which is not
 * an authorization check and would let a shared link outlive a permission.
 */
const routes: readonly AppRouteContribution<Application>[] = [serviceRoutes];

export default routes;
