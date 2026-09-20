import { ClipboardCheck, FileText, Home, Users, Wallet } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    // Business pages are reachable by every signed-in user: this application's roles differ by
    // record and action scope, not by page. The server narrows every read and write to the
    // contracts the caller participates in, so a page with no participation shows nothing.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/customers.js'),
    name: 'customers',
    navigation: { title: 'delivery.nav.customers', icon: Users },
    breadcrumb: { title: 'delivery.nav.customers' },
    path: '/customers',
  },
  {
    // Business pages are reachable by every signed-in user: this application's roles differ by
    // record and action scope, not by page. The server narrows every read and write to the
    // contracts the caller participates in, so a page with no participation shows nothing.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/contracts/index.js'),
    name: 'contracts',
    navigation: { title: 'delivery.nav.contracts', icon: FileText },
    breadcrumb: { title: 'delivery.nav.contracts' },
    path: '/contracts',
  },
  {
    // Business pages are reachable by every signed-in user: this application's roles differ by
    // record and action scope, not by page. The server narrows every read and write to the
    // contracts the caller participates in, so a page with no participation shows nothing.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/contracts/detail.js'),
    name: 'contract-detail',
    breadcrumb: { title: 'delivery.nav.contractDetail' },
    path: '/contracts/:id',
  },
  {
    // Business pages are reachable by every signed-in user: this application's roles differ by
    // record and action scope, not by page. The server narrows every read and write to the
    // contracts the caller participates in, so a page with no participation shows nothing.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/acceptance.js'),
    name: 'acceptance',
    navigation: { title: 'delivery.nav.acceptance', icon: ClipboardCheck },
    breadcrumb: { title: 'delivery.nav.acceptance' },
    path: '/acceptance',
  },
  {
    // Business pages are reachable by every signed-in user: this application's roles differ by
    // record and action scope, not by page. The server narrows every read and write to the
    // contracts the caller participates in, so a page with no participation shows nothing.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/receivables/index.js'),
    name: 'receivables',
    navigation: { title: 'delivery.nav.receivables', icon: Wallet },
    breadcrumb: { title: 'delivery.nav.receivables' },
    path: '/receivables',
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
