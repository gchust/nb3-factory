import { CalendarDays, Home } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/leave-requests.js'),
    name: 'leave-requests',
    navigation: { title: 'navigation.leaveRequests', icon: CalendarDays },
    path: '/leave-requests',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/leave-request-create.js'),
    name: 'leave-request-create',
    path: '/leave-requests/create',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/leave-request-detail.js'),
    name: 'leave-request-detail',
    path: '/leave-requests/:id',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
