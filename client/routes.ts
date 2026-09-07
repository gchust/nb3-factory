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
    componentLoader: () => import('./pages/assets.js'),
    name: 'assets',
    path: '/it-assets',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/asset-records.js'),
    name: 'assetRecords',
    path: '/it-assets/records',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/asset-detail.js'),
    name: 'assetDetail',
    path: '/it-assets/:id',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
