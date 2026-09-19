import {
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileCheck2,
  Home,
  LayoutDashboard,
  Package,
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
    name: 'procurement',
    navigation: { title: 'navigation.procurement', icon: ClipboardList },
    children: [
      {
        componentLoader: () => import('./pages/procurement/dashboard.js'),
        name: 'procurement-dashboard',
        navigation: {
          icon: LayoutDashboard,
          title: 'navigation.procurementDashboard',
        },
        path: '/procurement',
      },
      {
        componentLoader: () => import('./pages/procurement/suppliers.js'),
        name: 'procurement-suppliers',
        navigation: {
          icon: Factory,
          title: 'navigation.procurementSuppliers',
        },
        path: '/procurement/suppliers',
      },
      {
        componentLoader: () => import('./pages/procurement/materials.js'),
        name: 'procurement-materials',
        navigation: { icon: Package, title: 'navigation.procurementMaterials' },
        path: '/procurement/materials',
      },
      {
        componentLoader: () => import('./pages/procurement/orders.js'),
        name: 'procurement-orders',
        navigation: { icon: Truck, title: 'navigation.procurementOrders' },
        path: '/procurement/orders',
      },
      {
        componentLoader: () => import('./pages/procurement/todos.js'),
        name: 'procurement-todos',
        navigation: { icon: FileCheck2, title: 'navigation.procurementTodos' },
        path: '/procurement/todos',
      },
      {
        componentLoader: () => import('./pages/procurement/receipts.js'),
        name: 'procurement-receipts',
        navigation: {
          icon: ClipboardCheck,
          title: 'navigation.procurementReceipts',
        },
        path: '/procurement/receipts',
      },
    ],
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
