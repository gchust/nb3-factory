import { Home, Ticket } from 'lucide-react';
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
    name: 'tickets',
    path: '/tickets',
    auth: 'required',
    authz: {
      resource: { type: 'composite', id: 'helpdesk.tickets' },
      action: 'view',
    },
    navigation: { title: 'navigation.tickets', icon: Ticket, order: 10 },
    breadcrumb: { title: 'navigation.tickets' },
    componentLoader: () => import('./pages/tickets/index.js'),
    children: [
      {
        name: 'ticketCreate',
        path: 'new',
        auth: 'required',
        authz: {
          resource: { type: 'composite', id: 'helpdesk.tickets' },
          action: 'create',
        },
        breadcrumb: { title: 'helpdesk.newTicket' },
        componentLoader: () => import('./pages/tickets/create.js'),
      },
      {
        name: 'ticketDetail',
        path: ':ticketId',
        auth: 'required',
        authz: {
          resource: { type: 'composite', id: 'helpdesk.tickets' },
          action: 'view',
        },
        breadcrumb: { title: 'helpdesk.ticket' },
        componentLoader: () => import('./pages/tickets/detail.js'),
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
