import {
  BarChart3,
  CheckSquare,
  FileText,
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
  // A navigation group; the route renderer supplies its outlet.
  {
    name: 'procurement',
    navigation: { title: 'navigation.procurement', icon: ShoppingCart },
    children: [
      {
        auth: 'required',
        componentLoader: () => import('./pages/procurement-suppliers.js'),
        name: 'procurementSuppliers',
        navigation: { title: 'navigation.procurementSuppliers', icon: Truck },
        path: '/procurement/suppliers',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/procurement-requests.js'),
        name: 'procurementRequests',
        navigation: { title: 'navigation.procurementRequests', icon: FileText },
        path: '/procurement/requests',
      },
      {
        auth: 'required',
        // Detail pages share their parent list's page grant.
        access: { resource: 'procurementRequests', action: 'access' },
        componentLoader: () => import('./pages/procurement-request-detail.js'),
        name: 'procurementRequestDetail',
        path: '/procurement/requests/:id',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/procurement-approvals.js'),
        name: 'procurementApprovals',
        navigation: {
          title: 'navigation.procurementApprovals',
          icon: CheckSquare,
        },
        path: '/procurement/approvals',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/procurement-orders.js'),
        name: 'procurementOrders',
        navigation: { title: 'navigation.procurementOrders', icon: Package },
        path: '/procurement/orders',
      },
      {
        auth: 'required',
        componentLoader: () => import('./pages/procurement-statistics.js'),
        name: 'procurementStatistics',
        navigation: {
          title: 'navigation.procurementStatistics',
          icon: BarChart3,
        },
        path: '/procurement/statistics',
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
