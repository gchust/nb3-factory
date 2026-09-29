import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { apiRoutes as contactsRoutes } from './contacts.js';

const routes: readonly AppRouteContribution<Application>[] = [contactsRoutes];

export default routes;
