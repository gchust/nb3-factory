import { Home, Ticket } from 'lucide-react';
import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
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
    name: 'tickets',
    path: '/tickets',
    auth: 'required',
    // The page id is the basis for stored page grants: the permission sets in database/seed-data/tickets-permission-sets.ts
    // grant this page, and an identity without it is kept out of the menu and the page.
    authz: { resource: { type: 'page', id: 'tickets' }, action: 'access' },
    navigation: { title: 'navigation.tickets', icon: Ticket },
    componentLoader: () => import('./pages/tickets/index.js'),
    children: [
      {
        // /tickets/new: create dialog (RouteDialog)
        name: 'ticket-new',
        path: 'new',
        // The child inherits the page's access rule and only needs its own when it differs.
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/new.js'),
      },
      {
        // /tickets/:ticketId: detail drawer (RouteDrawer), over the list
        name: 'ticket-detail',
        path: ':ticketId',
        authz: 'skip',
        componentLoader: () => import('./pages/tickets/detail/index.js'),
        children: [
          {
            // /tickets/:ticketId/complete: complete dialog, stacked on the drawer
            name: 'ticket-detail-complete',
            path: 'complete',
            authz: 'skip',
            componentLoader: () => import('./pages/tickets/detail/complete.js'),
          },
        ],
      },
    ],
  },
]);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
