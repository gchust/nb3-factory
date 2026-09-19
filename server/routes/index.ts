import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import {
  rentalFileContentRoutes,
  rentalFileUploadRoutes,
} from './rental-files.js';
import { rentalsRoutes } from './rentals.js';

const routes: readonly AppRouteContribution<Application>[] = [
  rentalsRoutes,
  rentalFileUploadRoutes,
  rentalFileContentRoutes,
];

export default routes;
