import { Home, NotebookPen } from 'lucide-react';
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
    authz: 'skip',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
  {
    // `authz: 'skip'` to match the rest of this application-owned page: the endpoints under `/api/customer-memos`
    // each enforce their own authentication and authorization independently of this page guard.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/customer-memos/index.js'),
    name: 'customer-memos',
    navigation: { title: 'navigation.customerMemos', icon: NotebookPen },
    path: '/customer-memos',
    children: [
      {
        // Create: a dialog over the list, so it is a child route and the list page keeps its state behind it.
        authz: 'skip',
        componentLoader: () => import('./pages/customer-memos/new.js'),
        name: 'customer-memo-new',
        path: 'new',
      },
      {
        // Detail: a drawer over the list.
        authz: 'skip',
        componentLoader: () => import('./pages/customer-memos/detail/index.js'),
        name: 'customer-memo-detail',
        path: ':memoId',
        children: [
          {
            // Edit: a dialog stacked on the detail drawer.
            authz: 'skip',
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
