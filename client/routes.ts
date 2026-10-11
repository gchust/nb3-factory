import { Home, LifeBuoy, Users } from 'lucide-react';
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
    // The ticket list is the shared entry point for every role: the server scopes what each person may read, so the
    // page itself needs no page authorization. `authz: 'skip'` keeps it reachable for regular employees as well.
    auth: 'required',
    authz: 'skip',
    componentLoader: () => import('./pages/tickets/index.js'),
    name: 'tickets',
    navigation: { title: 'navigation.tickets', icon: LifeBuoy },
    path: '/tickets',
    children: [
      {
        // The create dialog renders over the list through the list's <Outlet />.
        auth: 'required',
        componentLoader: () => import('./pages/tickets/new.js'),
        name: 'ticket-new',
        path: 'new',
      },
      {
        // A covering child page: the ticket detail replaces the list. Declared after `new` so the static segment wins.
        auth: 'required',
        componentLoader: () => import('./pages/tickets/detail/index.js'),
        name: 'ticket-detail',
        path: ':ticketId',
      },
    ],
  },
  {
    // Only root may open this page; the role-assignment endpoints enforce the same rule server-side.
    auth: 'required',
    authz: 'unrestricted',
    componentLoader: () => import('./pages/team/index.js'),
    name: 'team',
    navigation: { title: 'navigation.team', icon: Users },
    path: '/team',
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
