import { FileTextIcon, Home, UsersIcon } from 'lucide-react';
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
    // The library. Record visibility is business logic in the server's document service, not a page grant: any
    // signed-in colleague lands here and sees the documents they may read. The menu title lives in `navigation`.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/documents/index.js'),
    name: 'documents',
    navigation: { title: 'navigation.documents', icon: FileTextIcon },
    path: '/documents',
  },
  {
    // A form too long for a dialog, so it has its own page rather than an overlay. Declared before the detail route
    // so the static `new` segment wins over `:documentId`.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/documents/new.js'),
    name: 'document-new',
    path: '/documents/new',
  },
  {
    // A document's own page. Declares no navigation, so it adds no menu entry, and no `breadcrumb`, so it leaves by
    // the Back button above its heading rather than by the header's trail.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/documents/detail.js'),
    name: 'document-detail',
    path: '/documents/:documentId',
  },
  {
    // Account and permission administration. Only a user with unrestricted access opens it; `authz: 'unrestricted'`
    // is the first page's rule and the endpoint the page calls enforces its own permission independently.
    auth: 'required',
    authz: 'unrestricted',
    componentLoader: () => import('./pages/users/index.js'),
    name: 'users',
    navigation: { title: 'navigation.users', icon: UsersIcon },
    path: '/users',
  },
]);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
