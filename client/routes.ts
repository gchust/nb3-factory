import { Home, StickyNote } from 'lucide-react';
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
  {
    // The one business page this application owns. `authz: 'skip'` because the application defines no permission
    // roles; the API behind it still enforces authentication on every request.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/customer-memos/index.js'),
    name: 'customer-memos',
    navigation: { title: 'navigation.customerMemos', icon: StickyNote },
    path: '/customer-memos',
    // Overlays are child routes: /customer-memos/new creates, /customer-memos/:memoId shows the detail drawer, and
    // /customer-memos/:memoId/edit stacks the edit dialog on that drawer.
    children: [
      {
        componentLoader: () => import('./pages/customer-memos/new.js'),
        name: 'customer-memo-new',
        path: 'new',
      },
      {
        componentLoader: () => import('./pages/customer-memos/detail/index.js'),
        name: 'customer-memo-detail',
        path: ':memoId',
        children: [
          {
            componentLoader: () =>
              import('./pages/customer-memos/detail/edit.js'),
            name: 'customer-memo-edit',
            path: 'edit',
          },
        ],
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
