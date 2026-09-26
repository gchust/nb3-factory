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
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'customer-memos' },
      action: 'access',
    },
    componentLoader: () => import('./pages/customer-memos/index.js'),
    name: 'customer-memos',
    navigation: { title: 'navigation.customerMemos', icon: NotebookPen },
    path: '/customer-memos',
    // Create and detail are child routes of the list, and edit is a child of detail so its dialog stacks on the
    // drawer. `authz: 'skip'` adds no check of its own; the list's page check still applies to every one of them.
    children: [
      {
        authz: 'skip',
        componentLoader: () => import('./pages/customer-memos/new.js'),
        name: 'customer-memo-new',
        path: 'new',
      },
      {
        authz: 'skip',
        componentLoader: () => import('./pages/customer-memos/detail/index.js'),
        name: 'customer-memo-detail',
        path: ':memoId',
        children: [
          {
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
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
