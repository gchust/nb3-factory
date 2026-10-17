import { Bell, Home, LifeBuoy, UsersRound } from 'lucide-react';
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
    authz: { resource: { type: 'page', id: 'service-desk' }, action: 'access' },
    auth: 'required',
    componentLoader: () => import('./pages/tickets/index.js'),
    name: 'tickets',
    navigation: { title: 'navigation.tickets', icon: LifeBuoy },
    path: '/tickets',
    children: [
      {
        authz: {
          resource: { type: 'page', id: 'service-desk' },
          action: 'access',
        },
        auth: 'required',
        componentLoader: () => import('./pages/tickets/new.js'),
        name: 'ticket-new',
        path: 'new',
      },
      {
        authz: {
          resource: { type: 'page', id: 'service-desk' },
          action: 'access',
        },
        auth: 'required',
        componentLoader: () => import('./pages/tickets/detail.js'),
        name: 'ticket-detail',
        path: ':ticketId',
      },
    ],
  },
  {
    // User and role management for service desk managers. The Users plugin ships the API but no page, so the
    // application owns this one. Its page grant is seeded on `service-desk-manager`; the API independently checks
    // the `user` record actions in that same set.
    authz: {
      resource: { type: 'page', id: 'service-desk.users' },
      action: 'access',
    },
    auth: 'required',
    componentLoader: () => import('./pages/users/index.js'),
    name: 'users',
    navigation: { title: 'navigation.users', icon: UsersRound },
    path: '/users',
  },
  {
    // Reached from the header's notification bell as well as this sidebar entry: the inbox lists every message the
    // person received, with unread state, so it belongs in the navigation rather than only behind the bell. The
    // plugin's API answers each person's own messages only, so the page needs no authorization of its own.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    navigation: { title: 'navigation.notifications', icon: Bell },
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
