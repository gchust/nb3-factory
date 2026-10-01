import { BookOpen, Home } from 'lucide-react';
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
    // A signed-in colleague reaches the library through a page grant. The page id is the identifier stored grants
    // record, so it is declared here alongside the route name they are keyed by.
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'library.documents' },
      action: 'access',
    },
    componentLoader: () => import('./pages/library/index.js'),
    name: 'library',
    navigation: { title: 'navigation.library', icon: BookOpen },
    path: '/library',
    children: [
      {
        // A create dialog addressed by URL. It skips its own page check because the page it is reached from already
        // applies the library page grant; the server's create policy governs the write.
        authz: 'skip',
        componentLoader: () => import('./pages/library/new.js'),
        name: 'library-new',
        path: 'new',
      },
      {
        // One document, shown as a drawer over the list. The server answers 404 once a temporary share is revoked,
        // so re-opening a shared link is safe.
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
