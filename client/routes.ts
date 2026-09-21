import {
  ClipboardCheck,
  FolderKanban,
  Home,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
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
    // projects the caller participates in, so a page with no participation shows nothing.
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
    // projects the caller participates in, so a page with no participation shows nothing.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/projects/index.js'),
    name: 'projects',
    navigation: { title: 'delivery.nav.projects', icon: FolderKanban },
    breadcrumb: { title: 'delivery.nav.projects' },
    path: '/projects',
  },
  {
    // Business pages are reachable by every signed-in user: this application's roles differ by
    // record and action scope, not by page. The server narrows every read and write to the
    // projects the caller participates in, so a page with no participation shows nothing.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/projects/detail.js'),
    name: 'project-detail',
    breadcrumb: { title: 'delivery.nav.projectDetail' },
    path: '/projects/:id',
  },
  {
    // Delivery task issues are maintained by the implementation consultant and read by everyone
    // who can read the project they belong to.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/issues.js'),
    name: 'issues',
    navigation: { title: 'delivery.nav.issues', icon: TriangleAlert },
    breadcrumb: { title: 'delivery.nav.issues' },
    path: '/issues',
  },
  {
    // Business pages are reachable by every signed-in user: this application's roles differ by
    // record and action scope, not by page. The server narrows every read and write to the
    // projects the caller participates in, so a page with no participation shows nothing.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/acceptance.js'),
    name: 'acceptance',
    navigation: { title: 'delivery.nav.acceptance', icon: ClipboardCheck },
    breadcrumb: { title: 'delivery.nav.acceptance' },
    path: '/acceptance',
  },
  {
    // Finance reads the settlement basis produced by an accepted delivery. The server lets a
    // finance-only account read settlements and nothing else.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/settlements/index.js'),
    name: 'settlements',
    navigation: { title: 'delivery.nav.settlements', icon: Wallet },
    breadcrumb: { title: 'delivery.nav.settlements' },
    path: '/settlements',
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
