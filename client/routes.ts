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
    // Reading and maintaining the internal document library. Access is a page
    // grant; the record scope and the write allowlist are enforced by the
    // server, so this declaration only decides whether the menu entry appears.
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'library.documents' },
      action: 'access',
    },
    componentLoader: () => import('./pages/library/index.js'),
    name: 'library',
    navigation: { title: 'library.title', icon: BookOpen },
    path: '/documents',
    // The detail view is a URL of its own, so a link opens it directly, a
    // refresh restores it, and a document that stops being readable (a revoked
    // temporary opening) answers "unavailable" instead of showing stale body.
    children: [
      {
        authz: 'skip',
        componentLoader: () => import('./pages/library/document-detail.js'),
        name: 'library-document',
        path: ':documentId',
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
