import { FileText, Home, Settings } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home/index.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    // Declares no navigation, so the application decides where its entry goes (for example a sidebar item with an
    // unread badge). The plugin's API answers each person's own messages only, so the page needs no authorization of
    // its own.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    path: '/inbox',
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
    // Where a command line's sign-in sends the person to approve it (`pages/auth/device.tsx`). Optional rather than
    // required so it renders outside the shell, like the sign-in pages; the page sends a guest to sign in and back.
    auth: 'optional',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/device.js'),
    name: 'device',
    path: '/device',
  },
  {
    // The document library. Who may open it and which records it shows are decided by the `documents` page grant and
    // the `documents.readable` record access, both enforced by the server; the page only renders what it receives.
    name: 'documents',
    path: '/documents',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'documents' }, action: 'access' },
    navigation: { title: 'navigation.documents', icon: FileText },
    componentLoader: () => import('./pages/documents/index.js'),
    children: [
      {
        // /documents/new: the create dialog, over the list.
        name: 'documents-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/documents/new.js'),
      },
      {
        // /documents/edit/:documentId: the edit dialog a row's menu opens, alone over the list.
        name: 'documents-edit',
        path: 'edit/:documentId',
        authz: 'skip',
        componentLoader: () => import('./pages/documents/edit.js'),
      },
      {
        // /documents/:documentId: the detail drawer, plus /documents/:documentId/edit stacked on it.
        name: 'documents-detail',
        path: ':documentId',
        authz: 'skip',
        componentLoader: () => import('./pages/documents/detail/index.js'),
        children: [
          {
            name: 'documents-detail-edit',
            path: 'edit',
            authz: 'skip',
            componentLoader: () => import('./pages/documents/detail/edit.js'),
          },
        ],
      },
    ],
  },
  {
    // An ordinary route placed in the sidebar, not a separate settings surface. Its page authorization is the
    // `documents.admin` settings item the server registers, so only a person holding that item reaches it.
    name: 'settings',
    path: '/settings',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'documents.admin' },
      action: 'read',
    },
    navigation: { title: 'navigation.settings', icon: Settings },
    componentLoader: () => import('./pages/settings/index.js'),
  },
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
