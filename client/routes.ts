import { Home, NotebookText } from 'lucide-react';
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
    // The customer memo list. `authz: 'skip'` keeps it reachable for any signed-in user; the task defines no
    // permission roles for it. The endpoints enforce authentication on their own.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/customer-memos/index.js'),
    name: 'customer-memos',
    navigation: { title: 'navigation.customerMemos', icon: NotebookText },
    path: '/customer-memos',
    // Create and detail are overlays declared as child routes of the page that stays underneath them.
    children: [
      {
        // /customer-memos/new: the create dialog. The static segment takes precedence over :memoId.
        name: 'customer-memo-new',
        path: 'new',
        componentLoader: () => import('./pages/customer-memos/new.js'),
      },
      {
        // /customer-memos/:memoId: the detail drawer.
        name: 'customer-memo-detail',
        path: ':memoId',
        componentLoader: () => import('./pages/customer-memos/detail/index.js'),
        children: [
          {
            // /customer-memos/:memoId/edit: the edit dialog, stacked on the detail drawer.
            name: 'customer-memo-edit',
            path: 'edit',
            componentLoader: () =>
              import('./pages/customer-memos/detail/edit.js'),
          },
        ],
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
