import {
  BarChart3,
  ClipboardList,
  Home,
  Package,
  ShoppingCart,
  Truck,
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
    auth: 'required',
    access: { resource: 'pos', action: 'access' },
    componentLoader: () => import('./pages/pos.js'),
    name: 'pos',
    navigation: { title: 'navigation.pos', icon: ShoppingCart },
    path: '/pos',
  },
  {
    auth: 'required',
    access: { resource: 'sales', action: 'access' },
    componentLoader: () => import('./pages/sales.js'),
    name: 'sales',
    navigation: { title: 'navigation.sales', icon: ClipboardList },
    path: '/sales',
  },
  {
    auth: 'required',
    access: { resource: 'products', action: 'access' },
    componentLoader: () => import('./pages/products.js'),
    name: 'products',
    navigation: { title: 'navigation.products', icon: Package },
    path: '/products',
  },
  {
    auth: 'required',
    access: { resource: 'purchases', action: 'access' },
    componentLoader: () => import('./pages/purchases.js'),
    name: 'purchases',
    navigation: { title: 'navigation.purchases', icon: Truck },
    path: '/purchases',
  },
  {
    auth: 'required',
    access: { resource: 'reports', action: 'access' },
    componentLoader: () => import('./pages/reports.js'),
    name: 'reports',
    navigation: { title: 'navigation.reports', icon: BarChart3 },
    path: '/reports',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
