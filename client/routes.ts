import { Home, Package } from 'lucide-react';
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
    componentLoader: () => import('./pages/office-supplies-list.js'),
    name: 'office-supplies',
    navigation: { title: 'navigation.officeSupplies', icon: Package },
    path: '/office-supplies',
    children: [
      {
        componentLoader: () => import('./pages/office-supply-detail.js'),
        name: 'office-supplies.detail',
        path: ':id',
      },
    ],
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
