import { Home, Wrench } from 'lucide-react';
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
    // Employees report a repair and read their own tickets; handlers see every ticket. The page grant is the route's
    // own permission: `it.tickets` is declared when the page is placed in the permission workspace, and a signed-in
    // user without it is refused by the route guard as well as by the endpoints the page calls.
    name: 'it-tickets',
    path: '/it-tickets',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'it.tickets' }, action: 'access' },
    navigation: { title: 'navigation.itTickets', icon: Wrench },
    componentLoader: () => import('./pages/it-tickets/index.js'),
    children: [
      {
        name: 'it-ticket-new',
        path: 'new',
        authz: 'skip',
        componentLoader: () => import('./pages/it-tickets/new.js'),
      },
      {
        name: 'it-ticket-detail',
        path: ':ticketId',
        authz: 'skip',
        componentLoader: () => import('./pages/it-tickets/detail/index.js'),
        children: [
          {
            name: 'it-ticket-complete',
            path: 'complete',
            authz: 'skip',
            componentLoader: () =>
              import('./pages/it-tickets/detail/complete.js'),
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
