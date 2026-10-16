import { BookText, Home, ShieldCheck } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

/**
 * The page grant the library permission sets carry
 * (`database/main/seeds/202610150002_library_permission_sets.ts`). Declaring it
 * on the first page of each path is what puts the page in the sidebar for the
 * sets that hold it; root bypasses it. The endpoints behind these pages enforce
 * their own authorization independently.
 */
const LIBRARY_PAGE = {
  resource: { type: 'page', id: 'library.documents' },
  action: 'access',
} as const;

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
    // The document library. `new`, `:id` and the edit dialog under `:id` are child routes, so each is
    // URL-addressable and opens over the list with its search and filters intact (I9). A document is a page that
    // covers the list rather than a drawer, because its body is the thing being read.
    auth: 'required',
    authz: LIBRARY_PAGE,
    componentLoader: () => import('./pages/library/index.js'),
    name: 'library',
    navigation: { title: 'navigation.library', icon: BookText },
    path: '/library',
    children: [
      {
        componentLoader: () => import('./pages/library/new.js'),
        name: 'library-new',
        path: 'new',
      },
      {
        componentLoader: () => import('./pages/library/detail/index.js'),
        name: 'library-document',
        path: ':id',
        children: [
          {
            componentLoader: () => import('./pages/library/detail/edit.js'),
            name: 'library-document-edit',
            path: 'edit',
          },
        ],
      },
    ],
  },
  {
    // The staff page: which permission sets each account holds and whether it is active. It is an ordinary page of
    // this application with no page grant, which leaves it to the root administrator alone, matching the Users
    // endpoints it calls.
    auth: 'required',
    authz: 'unrestricted',
    componentLoader: () => import('./pages/members/index.js'),
    name: 'members',
    navigation: { title: 'navigation.members', icon: ShieldCheck },
    path: '/members',
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
