import {
  BarChart3,
  ClipboardList,
  Factory,
  Home,
  Package,
  ShieldAlert,
} from 'lucide-react';
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
    name: 'production',
    navigation: { title: 'production.nav.group', icon: Factory },
    children: [
      {
        name: 'productionWorkOrders',
        path: '/work-orders',
        navigation: {
          title: 'production.nav.workOrders',
          icon: ClipboardList,
        },
        componentLoader: () => import('./pages/work-orders.js'),
      },
      {
        name: 'productionWorkOrderDetail',
        path: '/work-orders/:id',
        componentLoader: () => import('./pages/work-order-detail.js'),
      },
      {
        name: 'productionDefects',
        path: '/defects',
        navigation: { title: 'production.nav.defects', icon: ShieldAlert },
        componentLoader: () => import('./pages/defects.js'),
      },
      {
        name: 'productionProducts',
        path: '/products',
        navigation: { title: 'production.nav.products', icon: Package },
        componentLoader: () => import('./pages/products.js'),
      },
      {
        name: 'productionStatistics',
        path: '/statistics',
        navigation: { title: 'production.nav.statistics', icon: BarChart3 },
        componentLoader: () => import('./pages/statistics.js'),
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
