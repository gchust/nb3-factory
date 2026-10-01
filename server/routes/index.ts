import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import projectDocumentApiRoutes from './project-documents.js';

const routes: readonly AppRouteContribution<Application>[] = [
  projectDocumentApiRoutes,
];

export default routes;
