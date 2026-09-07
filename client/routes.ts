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
    path: '/',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/meeting-rooms.js'),
    name: 'meeting-rooms',
    path: '/meeting-rooms',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/meeting-rooms-detail.js'),
    name: 'meeting-rooms-detail',
    path: '/meeting-rooms/:id',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/meeting-bookings.js'),
    name: 'meeting-bookings',
    path: '/meeting-bookings',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/meeting-bookings-detail.js'),
    name: 'meeting-bookings-detail',
    path: '/meeting-bookings/:id',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
