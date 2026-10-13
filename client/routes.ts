import { Home, Library, Users } from 'lucide-react';
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
    // The document library. The page is guarded by a page grant, so it is only offered to the two jobs the library
    // defines; what each row shows and what the row menu offers comes from the server's own answer for that person.
    auth: 'required',
    authz: { resource: { type: 'page', id: 'documents' }, action: 'access' },
    componentLoader: () => import('./pages/documents/index.js'),
    name: 'documents',
    navigation: { title: 'navigation.documents', icon: Library },
    path: '/documents',
    children: [
      // Create, edit and share are child routes, so each opens as a dialog over the page the person is on. The list
      // page renders the <Outlet /> they appear in.
      {
        authz: 'skip',
        componentLoader: () => import('./pages/documents/new.js'),
        name: 'documents-new',
        path: 'new',
      },
      {
        authz: 'skip',
        componentLoader: () => import('./pages/documents/detail/edit.js'),
        name: 'documents-edit',
        path: 'edit/:documentId',
      },
      {
        authz: 'skip',
        componentLoader: () => import('./pages/documents/share.js'),
        name: 'documents-share',
        path: 'share/:documentId',
      },
      {
        // Reading a document happens in a drawer, which is why its path is the parameter alone. The drawer renders
        // its own <Outlet />, so editing and sharing a document stack on top of it instead of replacing it.
        authz: 'skip',
        componentLoader: () => import('./pages/documents/detail/index.js'),
        name: 'documents-detail',
        path: ':documentId',
        children: [
          {
            authz: 'skip',
            componentLoader: () => import('./pages/documents/detail/edit.js'),
            name: 'documents-detail-edit',
            path: 'edit',
          },
          {
            authz: 'skip',
            componentLoader: () => import('./pages/documents/share.js'),
            name: 'documents-detail-share',
            path: 'share',
          },
        ],
      },
    ],
  },
  {
    // People and their Permission Sets, and closing an account. Only an unrestricted identity (root) may open it;
    // the users endpoints enforce the same rule, so the page is a convenience, not the security boundary.
    auth: 'required',
    authz: 'unrestricted',
    componentLoader: () => import('./pages/admin/users.js'),
    name: 'users',
    navigation: { title: 'navigation.users', icon: Users },
    path: '/admin/users',
  },
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
