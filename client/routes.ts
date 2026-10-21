import { BookOpen, Home } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

import systemSettingsRoutes from './pages/settings/routes.js';

const documentSharingSettings = defineAppRoutes([
  {
    parent: 'settings',
    name: 'settingsDocumentsSharing',
    path: '/documents-sharing',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'documents.sharing' },
      action: 'read',
    },
    navigation: { title: 'settings.documentsSharing', icon: BookOpen },
    breadcrumb: { title: 'settings.documentsSharing' },
    componentLoader: () => import('./pages/settings/documents-sharing.js'),
  },
]);

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
    // The library is the business entry point. Its page grant is separate from the document data grant: a reader
    // may open the library without being able to edit any document.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'documents' }, action: 'access' },
    componentLoader: () => import('./pages/documents/index.js'),
    name: 'documents',
    navigation: { title: 'navigation.documents', icon: BookOpen, order: 20 },
    breadcrumb: { title: 'navigation.documents' },
    path: '/documents',
    children: [
      {
        authz: 'skip',
        componentLoader: () => import('./pages/documents/new.js'),
        name: 'documentsNew',
        path: 'new',
      },
      {
        authz: 'skip',
        componentLoader: () => import('./pages/documents/detail.js'),
        name: 'documentsDetail',
        path: ':documentId',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/documents/edit.js'),
            name: 'documentsEdit',
            path: 'edit',
          },
        ],
      },
    ],
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
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  systemSettingsRoutes,
  documentSharingSettings,
];

export default routes;
