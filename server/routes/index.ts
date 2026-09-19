import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { createRecruitmentFileRoutes } from './recruitment-files.js';
import { recruitmentApiRoutes } from './recruitment.js';

const routes: readonly AppRouteContribution<Application>[] = [
  recruitmentApiRoutes,
  ...createRecruitmentFileRoutes(),
];

export default routes;
