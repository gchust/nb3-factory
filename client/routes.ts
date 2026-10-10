import { Home, Library } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
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
    // The document library. The page grant uses the same resource id as the collection's composite resource; the
    // permission sets seeded by `database/main/seeds/` grant both.
    authz: {
      resource: { type: 'page', id: 'library.documents' },
      action: 'access',
    },
    auth: 'required',
    name: 'library',
    navigation: { title: 'navigation.library', icon: Library },
    path: '/library',
    componentLoader: () => import('./pages/library/index.js'),
    children: [
      {
        // /library/new: create dialog, over the list
        name: 'library-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/library/new.js'),
      },
      {
        // /library/edit/:documentId: edit dialog opened from a row's menu, alone over the list
        name: 'library-edit',
        path: 'edit/:documentId',
        authz: 'skip',
        componentLoader: () => import('./pages/library/edit.js'),
      },
      {
        // /library/:documentId: the detail drawer, over the list
        name: 'library-detail',
        path: ':documentId',
        authz: 'skip',
        componentLoader: () => import('./pages/library/detail/index.js'),
        children: [
          {
            // /library/:documentId/edit: edit dialog, stacked on the drawer
            name: 'library-detail-edit',
            path: 'edit',
            authz: 'skip',
            componentLoader: () => import('./pages/library/detail/edit.js'),
          },
        ],
      },
    ],
  } satisfies AppClientRouteDefinition,
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
