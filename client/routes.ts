import { BookOpen, Home, LibraryBig, ShieldCheck } from 'lucide-react';
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
    // Published, non-confidential documents. Readers hold this page grant; librarians hold it too so they can see
    // the same catalogue. The detail drawer is a child route so a document has its own URL.
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'library.reader' },
      action: 'access',
    },
    componentLoader: () => import('./pages/library/index.js'),
    name: 'library',
    navigation: { title: 'navigation.library', icon: BookOpen },
    path: '/library',
    children: [
      {
        authz: {
          resource: { type: 'page', id: 'library.reader' },
          action: 'access',
        },
        componentLoader: () => import('./pages/library/document.js'),
        name: 'library-document',
        path: ':documentId',
      },
    ],
  },
  {
    // A librarian's own documents, including drafts and confidential ones. Create, edit and sharing are child
    // routes so each opens from its own URL and closing returns to the list.
    auth: 'required',
    authz: {
      resource: { type: 'page', id: 'library.librarian' },
      action: 'access',
    },
    componentLoader: () => import('./pages/library/manage/index.js'),
    name: 'library-manage',
    navigation: { title: 'navigation.libraryManage', icon: LibraryBig },
    path: '/library/manage',
    children: [
      {
        authz: {
          resource: { type: 'page', id: 'library.librarian' },
          action: 'access',
        },
        componentLoader: () => import('./pages/library/manage/new.js'),
        name: 'library-manage-new',
        path: 'new',
      },
      {
        authz: {
          resource: { type: 'page', id: 'library.librarian' },
          action: 'access',
        },
        componentLoader: () => import('./pages/library/manage/edit.js'),
        name: 'library-manage-edit',
        path: ':documentId/edit',
      },
      {
        authz: {
          resource: { type: 'page', id: 'library.librarian' },
          action: 'access',
        },
        componentLoader: () => import('./pages/library/manage/share.js'),
        name: 'library-manage-share',
        path: ':documentId/share',
      },
      {
        authz: {
          resource: { type: 'page', id: 'library.librarian' },
          action: 'access',
        },
        componentLoader: () => import('./pages/library/document.js'),
        name: 'library-manage-document',
        path: ':documentId',
      },
    ],
  },
  {
    // Staff administration is for the unrestricted administrator only: user records and role assignments are
    // application-level configuration, not a business permission a reader or librarian should receive. The Users
    // plugin's endpoints independently require the relevant `user` action, which only that identity holds.
    auth: 'required',
    authz: 'unrestricted',
    componentLoader: () => import('./pages/admin/users/index.js'),
    name: 'admin-users',
    navigation: {
      title: 'navigation.adminUsers',
      icon: ShieldCheck,
      order: 90,
    },
    path: '/admin/users',
    children: [
      {
        authz: 'unrestricted',
        componentLoader: () => import('./pages/admin/users/permissions.js'),
        name: 'admin-user-permissions',
        path: ':userId/permissions',
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

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
