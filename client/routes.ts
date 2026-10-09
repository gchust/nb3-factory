import { Home, Library } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

/**
 * The document detail drawer and the edit dialog stacked on it, declared under
 * the page that opens documents. `owner` keeps the route names unique when
 * another page opens the same drawer.
 */
function documentDetailRoutes(owner: string): AppClientRouteDefinition[] {
  return [
    {
      // …/:documentId: the detail drawer, over the page that declares it.
      name: `${owner}-detail`,
      path: ':documentId',
      authz: 'skip',
      componentLoader: () => import('./pages/library/document-detail.js'),
      children: [
        {
          // …/:documentId/edit: the edit dialog, stacked on the drawer.
          name: `${owner}-detail-edit`,
          path: 'edit',
          authz: 'skip',
          componentLoader: () => import('./pages/library/document-edit.js'),
        },
      ],
    },
  ];
}

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
    // The internal document library. The page's own grant is seeded with the
    // 资料员 and 阅读者 work permissions; the endpoints independently enforce
    // the per-action, per-record document permissions.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'library' }, action: 'access' },
    componentLoader: () => import('./pages/library/index.js'),
    name: 'library',
    navigation: { title: 'navigation.library', icon: Library },
    path: '/library',
    children: [
      {
        // /library/new: the create dialog (RouteDialog).
        name: 'library-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/library/new.js'),
      },
      {
        // /library/edit/:documentId: the edit dialog opened from a row's menu,
        // alone over the list. The drawer's Edit uses /:documentId/edit below.
        name: 'library-edit',
        path: 'edit/:documentId',
        authz: 'skip',
        componentLoader: () => import('./pages/library/document-edit.js'),
      },
      // /library/:documentId (library-detail) and /library/:documentId/edit
      // (library-detail-edit).
      ...documentDetailRoutes('library'),
    ],
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
