import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { apiRoutes as meetingApiRoutes } from './meeting.js';

const routes: readonly AppRouteContribution<Application>[] = [meetingApiRoutes];

export default routes;
