import { Home, Inbox, LifeBuoy } from 'lucide-react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

import systemSettingsRoutes from './pages/settings/routes.js';

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
    // The template leaves the inbox out of the navigation so the application decides where its entry goes. The
    // header carries no Inbox button here; the work queue and the notifications that point at a ticket both live in
    // the sidebar instead. The plugin's API answers each person's own messages only, so the page needs no
    // authorization of its own.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    navigation: { title: 'navigation.inbox', icon: Inbox, order: 20 },
    path: '/inbox',
  },
  {
    auth: 'required',
    authz: { resource: { type: 'page', id: 'tickets' }, action: 'access' },
    breadcrumb: { title: 'navigation.tickets' },
    componentLoader: () => import('./pages/tickets/index.js'),
    name: 'tickets',
    navigation: { title: 'navigation.tickets', icon: LifeBuoy, order: 10 },
    path: '/tickets',
    children: [
      {
        authz: { resource: { type: 'page', id: 'tickets' }, action: 'access' },
        breadcrumb: { title: 'navigation.ticketNew' },
        componentLoader: () => import('./pages/tickets/new.js'),
        name: 'ticketNew',
        path: 'new',
      },
      {
        authz: { resource: { type: 'page', id: 'tickets' }, action: 'access' },
        breadcrumb: { title: 'navigation.ticketDetail' },
        componentLoader: () => import('./pages/tickets/detail/index.js'),
        name: 'ticketDetail',
        path: ':ticketId',
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
];

export default routes;
