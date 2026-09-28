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
    // The customer memo list. Every signed-in user reaches it; the CRUD children are reachable only through this page.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/memos/index.js'),
    name: 'memos',
    navigation: { title: 'navigation.memos', icon: NotebookPen },
    path: '/memos',
    children: [
      {
        componentLoader: () => import('./pages/memos/new.js'),
        name: 'memo-new',
        path: 'new',
      },
      {
        componentLoader: () => import('./pages/memos/detail/index.js'),
        name: 'memo-detail',
        path: ':memoId',
        children: [
          {
            componentLoader: () => import('./pages/memos/detail/edit.js'),
            name: 'memo-edit',
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
