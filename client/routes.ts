import { BarChart3, ClipboardList, Home, Package, Wrench } from 'lucide-react';
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
    componentLoader: () => import('./pages/assets.js'),
    name: 'assets',
    navigation: { title: 'it.nav.assets', icon: Package },
    // Not `/assets`: the SPA reserves `<base>/assets` for built client assets, so a page there is
    // served by the static-asset handler and 404s instead of reaching the router.
    path: '/it-assets',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/asset-assignments.js'),
    name: 'asset-assignments',
    navigation: { title: 'it.nav.assignments', icon: ClipboardList },
    path: '/asset-assignments',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/work-orders.js'),
    name: 'work-orders',
    navigation: { title: 'it.nav.workOrders', icon: Wrench },
    path: '/work-orders',
  },
  {
    auth: 'required',
    componentLoader: () => import('./pages/it-dashboard.js'),
    name: 'it-dashboard',
    navigation: { title: 'it.nav.dashboard', icon: BarChart3 },
    path: '/it-dashboard',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
