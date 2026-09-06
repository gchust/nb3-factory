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
    componentLoader: () => import('./pages/it-service-desk.js'),
    name: 'it-service-desk',
    path: '/it-service-desk',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/it-service-desk-detail.js'),
    name: 'it-service-desk-detail',
    path: '/it-service-desk/:id',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
