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
    componentLoader: () => import('./pages/equipment.js'),
    name: 'equipment',
    path: '/equipment',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/equipment-borrow-records.js'),
    name: 'equipment-borrow-records',
    path: '/equipment/borrow-records',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
