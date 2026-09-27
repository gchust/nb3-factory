import { Home, LibraryBig } from 'lucide-react';
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
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'library.documents' },
      action: 'access',
    },
    componentLoader: () => import('./pages/library/index.js'),
    name: 'library',
    navigation: { title: 'navigation.library', icon: LibraryBig },
    path: '/library',
    children: [
      {
        authz: 'skip',
        componentLoader: () => import('./pages/library/new.js'),
        name: 'library-document-new',
        path: 'new',
      },
      {
        authz: 'skip',
        componentLoader: () => import('./pages/library/detail/index.js'),
        name: 'library-document',
        path: ':documentId',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/library/detail/edit.js'),
            name: 'library-document-edit',
            path: 'edit',
          },
          {
            authz: 'skip',
            componentLoader: () => import('./pages/library/detail/share.js'),
            name: 'library-document-share',
            path: 'share',
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
