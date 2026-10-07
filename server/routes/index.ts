import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { collaborationApiRoutes } from './collaboration.js';
import {
  deliverableContentRootRoutes,
  deliverableFileUploadApiRoutes,
} from './deliverable-files.js';

const routes: readonly AppRouteContribution<Application>[] = [
  collaborationApiRoutes,
  deliverableFileUploadApiRoutes,
  deliverableContentRootRoutes,
];

export default routes;
