import { FileText, Home } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

/**
 * The document drawer and the edit dialog stacked on it.
 *
 * They are declared under the list page so the drawer opens over the list and
 * closing the dialog returns to the drawer. Both inherit the list page's
 * authorization: reaching them follows the same page grant, and the endpoints
 * behind them check the document actions independently.
 */
function documentDetailRoutes(): AppClientRouteDefinition[] {
  return [
    {
      name: 'document-detail',
      path: ':documentId',
      componentLoader: () => import('./pages/documents/detail/index.js'),
      children: [
        {
          name: 'document-detail-edit',
          path: 'edit',
          componentLoader: () => import('./pages/documents/detail/edit.js'),
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
    // The internal document library. Reading is granted by the page plus the
    // feature's permission sets; the endpoints check the library.documents
    // composite actions independently of this page grant.
    name: 'documents',
    path: '/documents',
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'library.documents' },
      action: 'access',
    },
    navigation: { title: 'navigation.documents', icon: FileText },
    componentLoader: () => import('./pages/documents/index.js'),
    children: [
      {
        // /documents/new: create dialog. Authorization is inherited from the
        // list page; the endpoint checks the create action independently.
        name: 'document-new',
        path: 'new',
        componentLoader: () => import('./pages/documents/new.js'),
      },
      // /documents/:documentId (drawer) and /documents/:documentId/edit (dialog)
      ...documentDetailRoutes(),
    ],
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
